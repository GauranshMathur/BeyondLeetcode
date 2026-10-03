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
 * This process is PID 1 and shares a uid with learner code, so it never chdirs into /work, reads
 * every Test input and the Build into memory and deletes /work/tests before the first learner
 * process starts, wipes /work and restores the Build from memory before every Test (nothing a Test
 * wrote survives it, so a Hidden Test's input cannot be read back by a later Test), and on any unexpected failure exits
 * non-zero without printing further results (the Runner then treats the run as failed).
 */
export const harnessScript = String.raw`
import ctypes, io, json, os, shutil, signal, stat, subprocess, sys, tarfile, threading, traceback

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


def wipe(path):
    # lstat: a symlink is unlinked, never followed. chmod first: learner code may have locked a directory.
    if stat.S_ISDIR(os.lstat(path).st_mode):
        os.chmod(path, 0o700)
        for name in os.listdir(path):
            wipe(os.path.join(path, name))
        os.rmdir(path)
    else:
        os.unlink(path)


def fresh_build():
    """Everything under /work is gone, then the Build is exactly as it was uploaded."""
    for name in os.listdir(WORK):
        wipe(os.path.join(WORK, name))
    for rel, data in BUILD_FILES:
        target = os.path.join(BUILD, rel)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "wb") as f:
            f.write(data)


CHILD_ENV = {"PATH": os.environ.get("PATH", "")}

sources = []
for root, _, names in os.walk(BUILD):
    sources += [os.path.join(root, n) for n in names if n.endswith(".py")]
compiled = subprocess.run(
    [sys.executable, "-I", "-m", "py_compile"] + sorted(sources),
    stdin=subprocess.DEVNULL, capture_output=True, env=CHILD_ENV,
)
if compiled.returncode != 0:
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
    # Orphans reparented to PID 1 would otherwise stay zombies and eat the pids limit.
    try:
        while os.waitpid(-1, os.WNOHANG)[0]:
            pass
    except ChildProcessError:
        pass


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
