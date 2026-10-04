/**
 * The fixed script that runs inside the Sandbox container (`python -I -c`: isolated, so nothing
 * learner-written in the working directory is ever imported into this process). It reads `<length>\n` and then
 * that many bytes of tar from stdin (the socket is never half-closed: Bun's net does not support it),
 * extracts it into the tmpfs work dir, checks the Build (py_compile, tsc --noEmit for TypeScript, or go build, which
 * also produces the binary, for Go), then runs each Test in its own
 * process and prints one JSON line per Test to stdout. Learner code never gets the harness's
 * stdout: it runs as a child with piped stdio.
 *
 * Tar layout: `build/<path>` for the Build's files, `tests/<index>.in` for each Test input.
 * Env: RUNNER_LANGUAGE ("python", "typescript" or "go"; the one script serves every Sandbox image),
 * RUNNER_TEST_COUNT, RUNNER_TEST_TIMEOUT_MS, RUNNER_OUTPUT_CAP, RUNNER_TOTAL_OUTPUT_CAP,
 * RUNNER_DEADLINE_S.
 *
 * Tests in one container are NOT isolated from each other: the harness clears files and IPC objects
 * but cannot reset kernel counters (pids, inode numbers, IPC ids, cgroup stats), which carry a few
 * bytes. Keeping Hidden Tests from visible ones is done by running them in separate containers.
 *
 * This process is PID 1 and shares a uid with learner code, so it never chdirs into /work, reads
 * every Test input and the Build into memory and deletes /work/tests before the first learner
 * process starts, wipes /work and restores the Build from memory before every Test (nothing a Test
 * wrote survives it, IPC objects included; for Go also /exec, where the binary lives, since /work
 * is noexec: it is wiped and restored from memory the same way), and on any unexpected failure exits
 * non-zero without printing further results (the Runner then treats the run as failed).
 */
export const harnessScript = String.raw`
import ctypes, io, json, os, re, shutil, signal, stat, subprocess, sys, tarfile, threading, time, traceback

# Learner code shares our uid. Not dumpable: it cannot open /proc/1/fd/1 (the result channel) or
# read our memory; ignoring SIGINT stops it interrupting us with os.kill(1, SIGINT).
ctypes.CDLL(None).prctl(4, 0, 0, 0, 0)
signal.signal(signal.SIGINT, signal.SIG_IGN)

LANGUAGE = os.environ["RUNNER_LANGUAGE"]
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
    if LANGUAGE == "go":
        # /exec is the second tmpfs (exec allowed) holding the compiled binary. Same treatment as /work:
        # emptied, metadata reset, binary restored from memory, so nothing a Test wrote there survives.
        wipe_children(EXEC)
        for attr in os.listxattr(EXEC):
            os.removexattr(EXEC, attr)
        with open(GO_BINARY_PATH, "wb") as f:
            f.write(GO_BINARY)
        os.chmod(GO_BINARY_PATH, 0o700)
        os.utime(EXEC, (0, 0))


SYNTAX_LINE = re.compile(rb"^(?:Sorry: )?(?:SyntaxError|IndentationError|TabError|ValueError)\b", re.M)
TSC_DIAGNOSTIC = re.compile(rb"error TS\d+")
# What go build prints, with exit 1, when the Learner's code is wrong: a compiler diagnostic, a
# linker error under its "# pkg" header (a missing main), a package that is not main (or a Build
# mixing packages), and cgo-only files (cgo is off). Anything else on exit 1 is the toolchain's.
GO_COMPILE_ERROR = re.compile(
    rb"^\S+\.go:\d+:\d+: "
    rb"|^# \S+\n(?:.*\n)*?[^\n]*function main is undeclared in the main package"
    rb"|^-buildmode=exe requires exactly one main package"
    rb"|^found packages \S+ \(\S+\) and \S+ \(\S+\) in "
    rb"|^package \S+: build constraints exclude all Go files",
    re.M,
)
CHILD_ENV = {"PATH": os.environ.get("PATH", "")}
EXEC = "/exec"
GO_BINARY_PATH = EXEC + "/main"
GO_BINARY = b""
GO_CACHE_SEED = "/opt/gocache"

# The two places the Language matters: how the Build is checked, and how a Test is run.
# Everything else (isolation, cleanup, caps, the watchdog) is shared.
if LANGUAGE == "python":
    RUN_ARGV = [sys.executable, "main.py"]
    sources = []
    for root, _, names in os.walk(BUILD):
        sources += [os.path.join(root, n) for n in names if n.endswith(".py")]
    compile_argv = [sys.executable, "-I", "-m", "py_compile"] + sorted(sources) if sources else None
    compile_cwd = None
elif LANGUAGE == "typescript":
    RUN_ARGV = ["node", "main.ts"]
    sources = []
    for root, _, names in os.walk(BUILD):
        sources += ["./" + os.path.relpath(os.path.join(root, n), BUILD) for n in names if n.endswith(".ts")]
    # Type errors are Compile Errors, as in a normal TypeScript project. erasableSyntaxOnly makes
    # enums and runtime namespaces (which Node's type stripping cannot run) fail here too.
    # --ignoreConfig: a learner tsconfig.json or jsconfig.json is never read (TS 6 exits 1 with TS5112 when files and a config coexist).
    # allowImportingTsExtensions: Node needs "./util.ts" in imports, and tsc only allows that with it.
    compile_argv = [
        "tsc", "--ignoreConfig", "--noEmit", "--pretty", "false", "--strict", "--target", "ES2023", "--lib", "ES2023",
        "--module", "nodenext", "--erasableSyntaxOnly", "--allowImportingTsExtensions", "--skipLibCheck",
        "--typeRoots", "/opt/ts/node_modules/@types", "--types", "node",
    ] + sorted(sources) if sources else None
    compile_cwd = BUILD
elif LANGUAGE == "go":
    RUN_ARGV = [GO_BINARY_PATH]
    # Go never touches the network or fetches a toolchain: GOPROXY=off, GOTOOLCHAIN=local. The build
    # cache and temp dir live in /work (tmpfs, wiped before every Test). The cache is a farm of symlinks
    # into the image's pre-warmed, read-only /opt/gocache (see Dockerfile.sandbox-go; GOFLAGS must match
    # it, -trimpath is part of every cache key), so the standard packages are never recompiled and
    # the cache costs no memory. No cgo: the image has no C compiler.
    GO_ENV = {
        "PATH": os.environ.get("PATH", ""), "GOCACHE": WORK + "/gocache", "GOTMPDIR": WORK + "/gotmp",
        "GOPATH": WORK + "/gopath", "GOFLAGS": "-trimpath", "CGO_ENABLED": "0", "GOTOOLCHAIN": "local",
        "GOPROXY": "off", "GOENV": "off", "GOWORK": "off", "GOSUMDB": "off",
    }
    MODULE = WORK + "/gomod"
    os.makedirs(GO_ENV["GOTMPDIR"])
    for here, _, names in os.walk(GO_CACHE_SEED):
        mirror = WORK + "/gocache" + here[len(GO_CACHE_SEED):]
        os.makedirs(mirror, exist_ok=True)
        for name in names:
            os.symlink(os.path.join(here, name), os.path.join(mirror, name))
    # A temporary module the harness writes itself: a learner go.mod, go.sum or go.work never reaches
    # the toolchain, so it cannot pick another Go version or ask for a dependency. A Build is the
    # top-level .go files, all package main.
    os.makedirs(MODULE)
    sources = [n for n in sorted(os.listdir(BUILD)) if n.endswith(".go") and os.path.isfile(os.path.join(BUILD, n))]
    for name in sources:
        shutil.copyfile(os.path.join(BUILD, name), os.path.join(MODULE, name))
    version = subprocess.run(
        ["go", "env", "GOVERSION"], stdin=subprocess.DEVNULL, capture_output=True, env=GO_ENV, check=True,
    ).stdout.decode().strip()  # "go1.27.1"
    with open(MODULE + "/go.mod", "w") as f:
        f.write("module solution\n\ngo %s\n" % ".".join(version[2:].split(".")[:2]))
    # -buildmode=exe: a package that is not main is an error, never a library written as the binary.
    if not sources:
        emit({"compileError": "No .go file in the Build (expected main.go)"})
        sys.exit(0)
    compile_argv = ["go", "build", "-buildmode=exe", "-ldflags=-s -w", "-o", GO_BINARY_PATH, "."]
    compile_cwd = MODULE
else:
    sys.exit("unknown language " + LANGUAGE)

compiled = None
if compile_argv:
    compiled = subprocess.run(
        compile_argv, stdin=subprocess.DEVNULL, capture_output=True,
        env=GO_ENV if LANGUAGE == "go" else CHILD_ENV, cwd=compile_cwd,
    )
if compiled and compiled.returncode != 0:
    # A Compile Error is the compiler saying the code is wrong. Anything else (a signal, OOM 137,
    # another code) is not the Learner's code being wrong: exit non-zero without a result and the
    # Runner reports its own failure.
    if LANGUAGE == "python":
        # py_compile exits 1 with a syntax-style exception line on stderr ("SyntaxError: ...",
        # "Sorry: IndentationError: ...", "ValueError: source code string cannot contain null bytes").
        diagnostics = compiled.stderr
        is_compile_error = compiled.returncode == 1 and SYNTAX_LINE.search(diagnostics)
    elif LANGUAGE == "go":
        # go build exits 1 for every failure; stderr tells the Learner's mistakes (GO_COMPILE_ERROR) from
        # the toolchain's (no space, cache failures, a killed compiler). Another exit code never is a
        # Compile Error, and an exit 1 matching nothing known fails closed to a Runner error.
        diagnostics = compiled.stderr
        is_compile_error = compiled.returncode == 1 and GO_COMPILE_ERROR.search(diagnostics)
    else:
        # tsc exits 2 when it found errors, and prints "error TS<n>" diagnostics to stdout. Exit 1 is
        # a bad option or other failure of ours, so it is not the Learner's fault.
        diagnostics = compiled.stdout
        is_compile_error = compiled.returncode == 2 and TSC_DIAGNOSTIC.search(diagnostics)
    if not is_compile_error:
        sys.exit("compile step failed with status %d" % compiled.returncode)
    emit({"compileError": text(diagnostics[:CAP], len(diagnostics) > CAP)})
    sys.exit(0)
if LANGUAGE == "go":
    # The binary is kept in memory and put back before every Test (fresh_build).
    with open(GO_BINARY_PATH, "rb") as f:
        GO_BINARY = f.read()


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
            RUN_ARGV,
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
