/**
 * The fixed script that runs inside the Sandbox container (`python -c`). It reads `<length>\n` and then
 * that many bytes of tar from stdin (the socket is never half-closed: Bun's net does not support it),
 * extracts it into the tmpfs work dir, byte-compiles the Build, then runs each Test in its own
 * process and prints one JSON line per Test to stdout. Learner code never gets the harness's
 * stdout: it runs as a child with piped stdio.
 *
 * Tar layout: `build/<path>` for the Build's files, `tests/<index>.in` for each Test input.
 * Env: RUNNER_TEST_COUNT, RUNNER_TEST_TIMEOUT_MS, RUNNER_OUTPUT_CAP.
 */
export const harnessScript = String.raw`
import ctypes, io, json, os, signal, subprocess, sys, tarfile, threading

# Learner code shares our uid. Not dumpable: it cannot open /proc/1/fd/1 (the result channel) or
# read our memory; ignoring SIGINT stops it interrupting us with os.kill(1, SIGINT).
ctypes.CDLL(None).prctl(4, 0, 0, 0, 0)
signal.signal(signal.SIGINT, signal.SIG_IGN)

COUNT = int(os.environ["RUNNER_TEST_COUNT"])
TIMEOUT = int(os.environ["RUNNER_TEST_TIMEOUT_MS"]) / 1000
CAP = int(os.environ["RUNNER_OUTPUT_CAP"])
WORK = "/work"
MARK = "\n[output truncated]"


def emit(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


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
os.chdir(BUILD)
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


def drain(fd, box):
    kept = bytearray()
    over = False
    while True:
        try:
            chunk = os.read(fd, 65536)
        except OSError:
            break
        if not chunk:
            break
        room = CAP - len(kept)
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


for i in range(COUNT):
    with open("%s/tests/%d.in" % (WORK, i), "rb") as f:
        data = f.read()
    proc = subprocess.Popen(
        [sys.executable, "main.py"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        bufsize=0, start_new_session=True, env=CHILD_ENV,
    )
    out, err = [], []
    threads = [
        threading.Thread(target=drain, args=(proc.stdout.fileno(), out), daemon=True),
        threading.Thread(target=drain, args=(proc.stderr.fileno(), err), daemon=True),
        threading.Thread(target=feed, args=(proc.stdin, data), daemon=True),
    ]
    for t in threads:
        t.start()
    try:
        code = proc.wait(timeout=TIMEOUT)
        status = "ok" if code == 0 else "runtimeError"
    except subprocess.TimeoutExpired:
        status = "timeout"
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except OSError:
        pass
    for t in threads:
        t.join(2)
    (o, o_over), (e, e_over) = (out or [(b"", False)])[0], (err or [(b"", False)])[0]
    emit({"i": i, "status": status, "stdout": text(o, o_over), "stderr": text(e, e_over)})
`;
