/**
 * The fixed script that runs inside the Sandbox container (`python -I -c`: isolated, so nothing
 * learner-written in the working directory is ever imported into this process). It reads `<length>\n` and then
 * that many bytes of tar from stdin (the socket is never half-closed: Bun's net does not support it),
 * extracts it into the tmpfs work dir, byte-compiles the Build, then runs each Test in its own
 * process and prints one JSON line per Test to stdout. Learner code never gets the harness's
 * stdout: it runs as a child with piped stdio.
 *
 * Tar layout: `build/<path>` for the Build's files, `tests/<index>.in` for each Test input.
 * Env: RUNNER_TEST_COUNT, RUNNER_TEST_TIMEOUT_MS, RUNNER_OUTPUT_CAP, RUNNER_TOTAL_OUTPUT_CAP,
 * RUNNER_DEADLINE_S.
 *
 * Tests in one container are NOT isolated from each other: the harness clears files and IPC objects
 * but cannot reset kernel counters (pids, inode numbers, IPC ids, cgroup stats), which carry a few
 * bytes. Keeping Hidden Tests from visible ones is done by running them in separate containers.
 *
 * This process is PID 1 and shares a uid with learner code, so it never chdirs into /work, reads
 * every Test input and the Build into memory and deletes /work/tests before the first learner
 * process starts, wipes /work and restores the Build from memory before every Test (nothing a Test
 * wrote survives it, IPC objects included), and on any unexpected failure exits
 * non-zero without printing further results (the Runner then treats the run as failed).
 */
export const harnessScript = String.raw`
import ctypes, io, json, os, re, shutil, signal, stat, subprocess, sys, tarfile, threading, time, traceback

# Learner code shares our uid. Not dumpable: it cannot open /proc/1/fd/1 (the result channel) or
# read our memory; ignoring SIGINT stops it interrupting us with os.kill(1, SIGINT).
ctypes.CDLL(None).prctl(4, 0, 0, 0, 0)
signal.signal(signal.SIGINT, signal.SIG_IGN)

COUNT = int(os.environ["RUNNER_TEST_COUNT"])
TIMEOUT = int(os.environ["RUNNER_TEST_TIMEOUT_MS"]) / 1000
CAP = int(os.environ["RUNNER_OUTPUT_CAP"])
TOTAL_CAP = int(os.environ["RUNNER_TOTAL_OUTPUT_CAP"])
DEADLINE = int(os.environ["RUNNER_DEADLINE_S"])
WORK = "/work"
MARK = "\n[output truncated]"


def deadline():
    os._exit(124)


# Backstop if the Runner dies: PID 1 leaves on its own. A timer thread, not a signal, so learner
# code cannot trip it early with os.kill(1, ...).
watchdog = threading.Timer(DEADLINE, deadline)
watchdog.daemon = True
watchdog.start()


def emit(obj):
    line = json.dumps(obj) + "\n"
    sys.stdout.write(line)
    sys.stdout.flush()
    return len(line)


def text(data, over):
    return data.decode("utf-8", "replace") + (MARK if over else "")


size = int(sys.stdin.buffer.readline())
archive = bytearray()
while len(archive) < size:
    chunk = sys.stdin.buffer.read(size - len(archive))
    if not chunk:
        sys.exit("stdin ended before the archive did")
    archive += chunk
with tarfile.open(fileobj=io.BytesIO(archive), mode="r:") as tar:
    tar.extractall(WORK, filter="data")
del archive

BUILD = WORK + "/build"
INPUTS = []
for n in range(COUNT):
    with open("%s/tests/%d.in" % (WORK, n), "rb") as f:
        INPUTS.append(f.read())
# Learner code shares our uid and must never see the Test inputs: they only live in our memory now.
if os.path.isdir(WORK + "/tests"):  # absent when there are no Tests
    shutil.rmtree(WORK + "/tests")
BUILD_FILES = []
for root, _, names in os.walk(BUILD):
    for name in names:
        path = os.path.join(root, name)
        with open(path, "rb") as f:
            BUILD_FILES.append((os.path.relpath(path, BUILD), f.read()))


def wipe_children(root):
    # Empties root without recursion (a deeply nested tree cannot overflow the stack). lstat: a
    # symlink is unlinked, never followed. chmod first: learner code may have locked a directory.
    dirs = []
    stack = [root]
    while stack:
        here = stack.pop()
        os.chmod(here, 0o700)
        for name in os.listdir(here):
            path = os.path.join(here, name)
            if stat.S_ISDIR(os.lstat(path).st_mode):
                dirs.append(path)
                stack.append(path)
            else:
                os.unlink(path)
    for path in reversed(dirs):
        os.rmdir(path)


LIBC = ctypes.CDLL(None, use_errno=True)


def removed(result):
    if result == -1:
        raise OSError(ctypes.get_errno(), "could not remove an IPC object")


def clear_ipc():
    # System V queues, semaphores and shared memory, and POSIX queues, outlive the process that
    # made them: kill(-1) does not touch them, so a Test could pass data to a later one through
    # them. Learner code shares our uid, so every object is ours to remove.
    for table, remove in (
        ("msg", lambda i: removed(LIBC.msgctl(i, 0, None))),
        ("sem", lambda i: removed(LIBC.semctl(i, 0, 0, ctypes.c_int(0)))),
        ("shm", lambda i: removed(LIBC.shmctl(i, 0, None))),
    ):
        try:
            with open("/proc/sysvipc/" + table) as f:
                rows = f.read().splitlines()[1:]
        except OSError:
            continue
        for row in rows:
            fields = row.split()
            if len(fields) > 1:
                remove(int(fields[1]))
    if os.path.isdir("/dev/mqueue"):
        for name in os.listdir("/dev/mqueue"):
            os.unlink(os.path.join("/dev/mqueue", name))


def fresh_build():
    # Nothing a Test left in /work or in IPC survives, its metadata included; the Build is as uploaded.
    clear_ipc()
    wipe_children(WORK)
    for attr in os.listxattr(WORK):
        os.removexattr(WORK, attr)
    for rel, data in BUILD_FILES:
        target = os.path.join(BUILD, rel)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "wb") as f:
            f.write(data)
    os.utime(WORK, (0, 0))


SYNTAX_LINE = re.compile(rb"^(?:Sorry: )?(?:SyntaxError|IndentationError|TabError|ValueError)\b", re.M)
CHILD_ENV = {"PATH": os.environ.get("PATH", "")}

sources = []
for root, _, names in os.walk(BUILD):
    sources += [os.path.join(root, n) for n in names if n.endswith(".py")]
compiled = subprocess.run(
    [sys.executable, "-I", "-m", "py_compile"] + sorted(sources),
    stdin=subprocess.DEVNULL, capture_output=True, env=CHILD_ENV,
)
if compiled.returncode != 0:
    # A Compile Error is py_compile exiting 1 with a syntax-style exception line on stderr
    # ("SyntaxError: ...", "Sorry: IndentationError: ...", "ValueError: source code string cannot
    # contain null bytes"). Anything else (a signal, OOM 137, another code) is not the Learner's
    # code being wrong: exit non-zero without a result and the Runner reports its own failure.
    if compiled.returncode != 1 or not SYNTAX_LINE.search(compiled.stderr):
        sys.exit("compile step failed with status %d" % compiled.returncode)
    emit({"compileError": text(compiled.stderr[:CAP], len(compiled.stderr) > CAP)})
    sys.exit(0)


def drain(fd, box, cap):
    kept = bytearray()
    over = False
    while True:
        try:
            chunk = os.read(fd, 65536)
        except OSError:
            break
        if not chunk:
            break
        room = cap - len(kept)
        if len(chunk) > room:
            over = True
        if room > 0:
            kept += chunk[:room]
    box.append((bytes(kept), over))


def feed(pipe, data):
    try:
        pipe.write(data)
    except OSError:
        pass
    try:
        pipe.close()
    except OSError:
        pass


def reap():
    # Orphans reparented to PID 1 would otherwise stay zombies and eat the pids limit. Waits (a
    # couple of seconds at most) until no other process is left, so none can still be creating
    # IPC objects while they are cleared.
    for _ in range(200):
        try:
            while os.waitpid(-1, os.WNOHANG)[0]:
                pass
        except ChildProcessError:
            pass
        if not [p for p in os.listdir("/proc") if p.isdigit() and p != "1"]:
            return
        time.sleep(0.01)
    # Something survived SIGKILL (or cannot be reaped): fail closed rather than run on.
    os._exit(1)


def run_tests():
    spent = 0
    for i in range(COUNT):
        cap = CAP if spent < TOTAL_CAP else 0
        fresh_build()
        proc = subprocess.Popen(
            [sys.executable, "main.py"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            bufsize=0, start_new_session=True, env=CHILD_ENV, cwd=BUILD,
        )
        out, err = [], []
        threads = [
            threading.Thread(target=drain, args=(proc.stdout.fileno(), out, cap), daemon=True),
            threading.Thread(target=drain, args=(proc.stderr.fileno(), err, cap), daemon=True),
            threading.Thread(target=feed, args=(proc.stdin, INPUTS[i]), daemon=True),
        ]
        for t in threads:
            t.start()
        try:
            code = proc.wait(timeout=TIMEOUT)
            status = "ok" if code == 0 else "runtimeError"
        except subprocess.TimeoutExpired:
            status = "timeout"
        # Nothing of this Test may outlive it, however it detached: kill(-1) skips us.
        try:
            os.kill(-1, signal.SIGKILL)
        except ProcessLookupError:
            pass  # nothing else was left alive
        proc.wait()
        for t in threads:
            t.join(2)
        reap()
        (o, o_over), (e, e_over) = (out or [(b"", False)])[0], (err or [(b"", False)])[0]
        if cap == 0:
            o_over = e_over = True
        spent += emit({"i": i, "status": status, "stdout": text(o, o_over), "stderr": text(e, e_over)})


try:
    run_tests()
except BaseException:
    traceback.print_exc()
    os._exit(1)
`;
