# The protocol this script speaks is described in harness.ts.

import ctypes, io, json, os, platform, re, shutil, signal, stat, subprocess, sys, tarfile, threading, time, traceback

# Set by main() from the RUNNER_* variables. Importing this file runs nothing.
LANGUAGE = ""
COUNT = 0
TIMEOUT = 0.0
CAP = 0
TOTAL_CAP = 0
DEADLINE = 0
INPUTS = []
BUILD_FILES = []
EMITTED_FILES = []
EXEC_BINARY = b""
WORK = "/work"
BUILD = WORK + "/build"
OUT = WORK + "/out"  # TypeScript only: the JavaScript tsc emits, beside the Build, never inside it
EXEC = "/exec"
EXEC_BINARY_PATH = EXEC + "/main"
MARK = "\n[output truncated]"


def deadline():
    os._exit(124)


def emit(obj):
    line = json.dumps(obj) + "\n"
    sys.stdout.write(line)
    sys.stdout.flush()
    return len(line)


def text(data, over):
    return data.decode("utf-8", "replace") + (MARK if over else "")


def receive():
    # Reads the archive from stdin, extracts it, and keeps the Test inputs and the Build in memory.
    global INPUTS, BUILD_FILES
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


def removed(result):
    if result == -1:
        raise OSError(ctypes.get_errno(), "could not remove an IPC object")


def clear_ipc():
    # System V queues, semaphores and shared memory, and POSIX queues, outlive the process that
    # made them: kill(-1) does not touch them, so a Test could pass data to a later one through
    # them. Learner code shares our uid, so every object is ours to remove.
    libc = ctypes.CDLL(None, use_errno=True)
    for table, remove in (
        ("msg", lambda i: removed(libc.msgctl(i, 0, None))),
        ("sem", lambda i: removed(libc.semctl(i, 0, 0, ctypes.c_int(0)))),
        ("shm", lambda i: removed(libc.shmctl(i, 0, None))),
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
    for rel, data in EMITTED_FILES:
        target = os.path.join(OUT, rel)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "wb") as f:
            f.write(data)
    os.utime(WORK, (0, 0))
    if LANGUAGES[LANGUAGE]["exec"]:
        # /exec is the second tmpfs (exec allowed) holding the compiled binary. Same treatment as /work:
        # emptied, metadata reset, binary restored from memory, so nothing a Test wrote there survives.
        wipe_children(EXEC)
        for attr in os.listxattr(EXEC):
            os.removexattr(EXEC, attr)
        with open(EXEC_BINARY_PATH, "wb") as f:
            f.write(EXEC_BINARY)
        os.chmod(EXEC_BINARY_PATH, 0o700)
        os.utime(EXEC, (0, 0))


GO_CACHE_SEED = "/opt/gocache"


class NoSources(Exception):
    pass


def child_env():
    return {"PATH": os.environ.get("PATH", "")}


# The compile steps. Each returns (argv, cwd, env), or None when the Build has nothing to check.

def compile_python():
    sources = []
    for root, _, names in os.walk(BUILD):
        sources += [os.path.join(root, n) for n in names if n.endswith(LANGUAGES["python"]["ext"])]
    if not sources:
        return None
    return [sys.executable, "-I", "-m", "py_compile"] + sorted(sources), None, child_env()


def compile_typescript():
    sources = []
    for root, _, names in os.walk(BUILD):
        sources += ["./" + os.path.relpath(os.path.join(root, n), BUILD) for n in names if n.endswith(LANGUAGES["typescript"]["ext"])]
    if not sources:
        return None
    # Type errors are Compile Errors, as in a normal TypeScript project. erasableSyntaxOnly makes
    # enums and runtime namespaces (which Node's type stripping cannot run) fail here too.
    # --ignoreConfig: a learner tsconfig.json or jsconfig.json is never read (TS 6 exits 1 with TS5112 when files and a config coexist).
    # allowImportingTsExtensions: tsc only allows "./util.ts" in imports with it, and
    # rewriteRelativeImportExtensions turns them into "./util.js" in the emit.
    # The type check is the one every Test used to pay for in `node` (stripping types again); it now
    # runs once, and each Test runs the emitted JavaScript. The source map keeps a runtime error
    # naming main.ts and the Learner's line (node --enable-source-maps).
    argv = [
        "tsc", "--ignoreConfig", "--outDir", OUT, "--rootDir", BUILD, "--sourceMap",
        "--rewriteRelativeImportExtensions", "--pretty", "false", "--strict", "--target", "ES2023", "--lib", "ES2023",
        "--module", "nodenext", "--erasableSyntaxOnly", "--allowImportingTsExtensions", "--skipLibCheck",
        "--typeRoots", "/opt/ts/node_modules/@types", "--types", "node",
    ] + sorted(sources)
    return argv, BUILD, child_env()


def compile_go():
    # Go never touches the network or fetches a toolchain: GOPROXY=off, GOTOOLCHAIN=local. The build
    # cache and temp dir live in /work (tmpfs, wiped before every Test). The cache is a farm of symlinks
    # into the image's pre-warmed, read-only /opt/gocache (see Dockerfile.sandbox-go; GOFLAGS must match
    # it, -trimpath is part of every cache key), so the standard packages are never recompiled and
    # the cache costs no memory. No cgo: the image has no C compiler.
    env = {
        "PATH": os.environ.get("PATH", ""), "GOCACHE": WORK + "/gocache", "GOTMPDIR": WORK + "/gotmp",
        "GOPATH": WORK + "/gopath", "GOFLAGS": "-trimpath", "CGO_ENABLED": "0", "GOTOOLCHAIN": "local",
        "GOPROXY": "off", "GOENV": "off", "GOWORK": "off", "GOSUMDB": "off",
    }
    module = WORK + "/gomod"
    os.makedirs(env["GOTMPDIR"])
    for here, _, names in os.walk(GO_CACHE_SEED):
        mirror = WORK + "/gocache" + here[len(GO_CACHE_SEED):]
        os.makedirs(mirror, exist_ok=True)
        for name in names:
            os.symlink(os.path.join(here, name), os.path.join(mirror, name))
    # A temporary module the harness writes itself: a learner go.mod, go.sum or go.work never reaches
    # the toolchain, so it cannot pick another Go version or ask for a dependency. A Build is the
    # top-level .go files, all package main.
    os.makedirs(module)
    sources = [n for n in sorted(os.listdir(BUILD)) if n.endswith(LANGUAGES["go"]["ext"]) and os.path.isfile(os.path.join(BUILD, n))]
    for name in sources:
        shutil.copyfile(os.path.join(BUILD, name), os.path.join(module, name))
    version = subprocess.run(
        ["go", "env", "GOVERSION"], stdin=subprocess.DEVNULL, capture_output=True, env=env, check=True,
    ).stdout.decode().strip()  # "go1.27.1"
    with open(module + "/go.mod", "w") as f:
        f.write("module solution\n\ngo %s\n" % ".".join(version[2:].split(".")[:2]))
    # -buildmode=exe: a package that is not main is an error, never a library written as the binary.
    if not sources:
        raise NoSources("No %s file in the Build (expected %s)" % (LANGUAGES["go"]["ext"], LANGUAGES["go"]["entry"]))
    return ["go", "build", "-buildmode=exe", "-ldflags=-s -w", "-o", EXEC_BINARY_PATH, "."], module, env


# py_compile exits 1 with a syntax-style exception line on stderr ("SyntaxError: ...",
# "Sorry: IndentationError: ...", "ValueError: source code string cannot contain null bytes").
SYNTAX_LINE = re.compile(rb"^(?:Sorry: )?(?:SyntaxError|IndentationError|TabError|ValueError)\b", re.M)
# tsc exits 2 when it found errors, and prints "error TS<n>" diagnostics to stdout. Exit 1 is
# a bad option or other failure of ours, so it is not the Learner's fault.
TSC_DIAGNOSTIC = re.compile(rb"error TS\d+")
# What go build prints, with exit 1, when the Learner's code is wrong: a compiler diagnostic, a
# linker error under its "# pkg" header (a missing main), a package that is not main (or a Build
# mixing packages), and cgo-only files (cgo is off). Anything else on exit 1 is the toolchain's.
# go build exits 1 for every failure; stderr tells the Learner's mistakes from the toolchain's (no
# space, cache failures, a killed compiler). An exit 1 matching nothing known fails closed.
GO_COMPILE_ERROR = re.compile(
    rb"^\S+\.go:\d+:\d+: "
    rb"|^# \S+\n(?:.*\n)*?[^\n]*function main is undeclared in the main package"
    rb"|^-buildmode=exe requires exactly one main package"
    rb"|^found packages \S+ \(\S+\) and \S+ \(\S+\) in "
    rb"|^package \S+: build constraints exclude all Go files",
    re.M,
)

# The two places the Language matters: how the Build is checked, and how a Test is run. Everything
# else (isolation, cleanup, caps, the watchdog) is shared. Per Language:
#   entry    the Build's entry file, and ext the extension of its source files
#   run      function of the entry returning the argv of a Test, run in the Build directory
#   compile  function returning (argv, cwd, env) of the compile step, or None to skip it
#   error    the compile-error rule: the compiler's `exit` code, the `stream` it reports on and
#            the `pattern` its diagnostics match. Anything else (a signal, OOM 137, another code)
#            is not the Learner's code being wrong: the Runner reports its own failure.
#   exec     whether the compiled binary lives in /exec (the second tmpfs, exec allowed)
LANGUAGES = {
    "python": {
        "entry": "main.py", "ext": ".py", "run": lambda entry: [sys.executable, entry], "compile": compile_python,
        "error": {"exit": 1, "stream": "stderr", "pattern": SYNTAX_LINE}, "exec": False,
    },
    "typescript": {
        "entry": "main.ts", "ext": ".ts", "run": lambda entry: ["node", "--enable-source-maps", OUT + "/" + entry[:-3] + ".js"],
        "compile": compile_typescript,
        "error": {"exit": 2, "stream": "stdout", "pattern": TSC_DIAGNOSTIC}, "exec": False,
    },
    "go": {
        "entry": "main.go", "ext": ".go", "run": lambda entry: [EXEC_BINARY_PATH], "compile": compile_go,
        "error": {"exit": 1, "stream": "stderr", "pattern": GO_COMPILE_ERROR}, "exec": True,
    },
}


def classify_compile(language, returncode, stdout, stderr):
    # The diagnostics of a Compile Error, or None when the failure is the Runner's.
    rule = LANGUAGES[language]["error"]
    diagnostics = stderr if rule["stream"] == "stderr" else stdout
    if returncode == rule["exit"] and rule["pattern"].search(diagnostics):
        return diagnostics
    return None


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
            LANGUAGES[LANGUAGE]["run"](LANGUAGES[LANGUAGE]["entry"]),
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            bufsize=0, start_new_session=True, env=child_env(), cwd=BUILD,
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


def seccomp_program(machine):
    # Classic BPF over struct seccomp_data (nr at 0, arch at 4, args at 16 + 8 * n; little-endian, so
    # the low 32 bits of an argument come first). Jumps may only go forward, so the shared returns
    # sit at the end. What it does: a non-native arch (closes i386 int 0x80) and, on x86_64, x32
    # syscalls get ENOSYS; ptrace, and setrlimit(RLIMIT_CORE) and prlimit64(RLIMIT_CORE) with a new
    # limit, get EPERM (a tracer can rewrite a checked argument after the filter has read it on
    # arm64 kernels without the upstream fixes, so nothing may trace); everything else is allowed.
    # It stacks on Docker's default profile.
    if machine == "x86_64":
        audit, ptrace, setrlimit, prlimit64, x32 = 0xC000003E, 101, 160, 302, True
    elif machine in ("aarch64", "arm64"):
        audit, ptrace, setrlimit, prlimit64, x32 = 0xC00000B7, 117, 164, 261, False
    else:
        sys.exit("no seccomp filter for " + machine)
    LD, JEQ, JSET, RET = 0x20, 0x15, 0x45, 0x06
    RLIMIT_CORE = 4
    program = [
        (LD, 0, 0, 4), (JEQ, "nr", "bad", audit),
        ("nr",), (LD, 0, 0, 0),
    ]
    if x32:
        program.append((JSET, "bad", 0, 0x40000000))
    program += [
        (JEQ, "deny", 0, ptrace),
        (JEQ, "sr", 0, setrlimit), (JEQ, "pl", "allow", prlimit64),
        ("sr",), (LD, 0, 0, 16), (JEQ, "deny", "allow", RLIMIT_CORE),
        # prlimit64(pid, resource, new_limit, old_limit): only a call with a non-NULL new_limit
        # (both halves of the pointer) changes anything.
        ("pl",), (LD, 0, 0, 24), (JEQ, 0, "allow", RLIMIT_CORE),
        (LD, 0, 0, 32), (JEQ, 0, "deny", 0),
        (LD, 0, 0, 36), (JEQ, "allow", "deny", 0),
        ("deny",), (RET, 0, 0, 0x00050000 | 1),
        ("bad",), (RET, 0, 0, 0x00050000 | 38),
        ("allow",), (RET, 0, 0, 0x7FFF0000),
    ]
    labels, count = {}, 0
    for item in program:
        if len(item) == 1:
            labels[item[0]] = count
        else:
            count += 1
    rows, count = [], 0
    for item in program:
        if len(item) == 1:
            continue
        code, jt, jf, k = item
        count += 1
        rows.append((code, labels[jt] - count if isinstance(jt, str) else jt,
                     labels[jf] - count if isinstance(jf, str) else jf, k))
    return rows


def install_seccomp():
    # Learner code shares our uid and may lower its own soft RLIMIT_CORE, which would start the
    # host's piped core-dump helper as root; this holds the limit at the 1:1 the container sets.
    # Installed before anything is compiled or run, so every compile and Test process inherits it.
    rows = seccomp_program(platform.machine())

    class Insn(ctypes.Structure):
        _fields_ = [("code", ctypes.c_uint16), ("jt", ctypes.c_uint8), ("jf", ctypes.c_uint8), ("k", ctypes.c_uint32)]

    class Prog(ctypes.Structure):
        _fields_ = [("len", ctypes.c_uint16), ("filter", ctypes.POINTER(Insn))]

    insns = (Insn * len(rows))(*[Insn(*row) for row in rows])
    prog = Prog(len(rows), insns)
    libc = ctypes.CDLL(None, use_errno=True)
    libc.prctl.argtypes = [ctypes.c_int, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong]
    # PR_SET_NO_NEW_PRIVS (the container sets it too), then PR_SET_SECCOMP / SECCOMP_MODE_FILTER.
    if libc.prctl(38, 1, 0, 0, 0) != 0 or libc.prctl(22, 2, ctypes.addressof(prog), 0, 0) != 0:
        sys.exit("seccomp filter failed: errno %d" % ctypes.get_errno())


def main():
    global LANGUAGE, COUNT, TIMEOUT, CAP, TOTAL_CAP, DEADLINE, EXEC_BINARY
    # Learner code shares our uid. Not dumpable: it cannot open /proc/1/fd/1 (the result channel) or
    # read our memory; ignoring SIGINT stops it interrupting us with os.kill(1, SIGINT).
    ctypes.CDLL(None).prctl(4, 0, 0, 0, 0)
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    install_seccomp()

    LANGUAGE = os.environ["RUNNER_LANGUAGE"]
    COUNT = int(os.environ["RUNNER_TEST_COUNT"])
    TIMEOUT = int(os.environ["RUNNER_TEST_TIMEOUT_MS"]) / 1000
    CAP = int(os.environ["RUNNER_OUTPUT_CAP"])
    TOTAL_CAP = int(os.environ["RUNNER_TOTAL_OUTPUT_CAP"])
    DEADLINE = int(os.environ["RUNNER_DEADLINE_S"])
    if LANGUAGE not in LANGUAGES:
        sys.exit("unknown language " + LANGUAGE)
    language = LANGUAGES[LANGUAGE]

    # Backstop if the Runner dies: PID 1 leaves on its own. A timer thread, not a signal, so learner
    # code cannot trip it early with os.kill(1, ...).
    watchdog = threading.Timer(DEADLINE, deadline)
    watchdog.daemon = True
    watchdog.start()

    receive()

    try:
        step = language["compile"]()
    except NoSources as e:
        emit({"compileError": str(e)})
        sys.exit(0)
    if step:
        argv, cwd, env = step
        compiled = subprocess.run(argv, stdin=subprocess.DEVNULL, capture_output=True, env=env, cwd=cwd)
        if compiled.returncode != 0:
            diagnostics = classify_compile(LANGUAGE, compiled.returncode, compiled.stdout, compiled.stderr)
            if diagnostics is None:
                sys.exit("compile step failed with status %d" % compiled.returncode)
            emit({"compileError": text(diagnostics[:CAP], len(diagnostics) > CAP)})
            sys.exit(0)
    if LANGUAGE == "typescript":
        # The emitted JavaScript is kept in memory and put back before every Test (fresh_build).
        for root, _, names in os.walk(OUT):
            for name in names:
                path = os.path.join(root, name)
                with open(path, "rb") as f:
                    EMITTED_FILES.append((os.path.relpath(path, OUT), f.read()))
    if language["exec"]:
        # The binary is kept in memory and put back before every Test (fresh_build).
        with open(EXEC_BINARY_PATH, "rb") as f:
            EXEC_BINARY = f.read()

    try:
        run_tests()
    except BaseException:
        traceback.print_exc()
        os._exit(1)


if __name__ == "__main__":
    main()
