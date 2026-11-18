#!/usr/bin/env bash
# Tests smoke-repeat.sh: the classifier of one browser-flow run, and the record writer. Run: .github/smoke-repeat.test.sh
# The script is sourced with stub docker, sudo, curl and timeout first on PATH, so a function that reached for one
# of them would hit a stub and fail loudly, never the real thing.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
bin="$work/bin"
mkdir -p "$bin"
for tool in docker sudo curl timeout; do
  printf '#!/bin/sh\necho "stub %s called: $*" >&2\nexit 99\n' "$tool" >"$bin/$tool"
  chmod +x "$bin/$tool"
done
PATH="$bin:$PATH"
if [ "$(command -v docker)" != "$bin/docker" ]; then
  echo "FAIL the stub docker is not first on PATH: $(command -v docker)"
  exit 1
fi

# shellcheck source=smoke-repeat.sh
source "$here/smoke-repeat.sh"
set +e
fail=0

ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; fail=1; }

query_engine_500='[500] POST /problems/[problemId] PrismaClientRustPanicError'
query_engine_get='[500] GET /problems/[problemId] PrismaClientUnknownRequestError'
warn_one='prisma:warn Prisma failed to detect the libssl/openssl version to use, and may not work as expected. Defaulting to "openssl-1.1.x".'
warn_two='prisma:warn Please manually install OpenSSL via `apt-get update -y && apt-get install -y openssl` and try installing Prisma again.'
listening='Listening on http://0.0.0.0:3000'

# run_case <name> <web log text> <runner log text> <flow exit> <flow log text>: sets $got to classify_run's output.
run_case() {
  printf '%s\n' "$2" >"$work/web.log"
  printf '%s\n' "$3" >"$work/runner.log"
  printf '%s\n' "$5" >"$work/flow.log"
  got="$(classify_run "$work/web.log" "$work/runner.log" "$4" "$work/flow.log")"
}

first_line() { printf '%s\n' "$got" | head -n 1; }

# 1. A Rust panic on a Submit
run_case one "$(printf '%s\n%s\n%s' "$warn_one" "$query_engine_500" "$listening")" "" 1 "Error: expect(received).toBe"
[ "$(first_line)" = query-engine ] && ok "a RustPanicError 500 is query-engine" || bad "a RustPanicError 500: got '$got'"
printf '%s\n' "$got" | grep -qxF "$query_engine_500" && ok "the query-engine line is kept" || bad "the query-engine line was dropped: '$got'"

# 2. An unknown request error on a Problem page
run_case two "$query_engine_get" "" 1 "Error: timeout"
[ "$(first_line)" = query-engine ] && printf '%s\n' "$got" | grep -qxF "$query_engine_get" \
  && ok "an UnknownRequestError 500 is query-engine" || bad "an UnknownRequestError 500: got '$got'"

# 3. Docker Hub's pull limit and a Runner that was not ready: not a query-engine error
run_case three "[500] POST /problems/[problemId] runner RunnerNotReady" "toomanyrequests: You have reached your unauthenticated pull rate limit." 1 "Error: expect(page).toHaveURL"
[ "$(first_line)" = other ] && ok "no Prisma line is other" || bad "no Prisma line: got '$got'"
printf '%s\n' "$got" | grep -q "toomanyrequests" && ok "the reason is toomanyrequests" || bad "the reason is missing: '$got'"
printf '%s\n' "$got" | grep -q PrismaClient && bad "an other run names PrismaClient: '$got'" || ok "an other run names no PrismaClient"

# 3b. Only RunnerNotReady, and only the flow's own error
run_case three-b "[500] POST /problems/[problemId] runner RunnerNotReady" "" 1 "Error: expect(page).toHaveURL"
[ "$(first_line)" = other ] && printf '%s\n' "$got" | grep -q RunnerNotReady \
  && ok "RunnerNotReady is the reason" || bad "RunnerNotReady: got '$got'"
run_case three-c "$listening" "" 1 "$(printf 'noise\nError: expect(locator).toBeVisible\nError: later')"
[ "$(first_line)" = other ] && printf '%s\n' "$got" | grep -qF "Error: expect(locator).toBeVisible" \
  && ! printf '%s\n' "$got" | grep -qF "Error: later" \
  && ok "the flow's first Error line is the reason" || bad "the flow's first Error line: got '$got'"

# 4. The OpenSSL warnings are noted and never an error
run_case four "$(printf '%s\n%s\n%s' "$warn_one" "$warn_two" "$listening")" "" 0 ""
[ "$(first_line)" = passed ] && ok "the libssl/openssl warnings alone are passed" || bad "the warnings: got '$got'"
printf '%s\n' "$got" | grep -qi "libssl/openssl" && ok "the warnings are noted" || bad "the warnings are not noted: '$got'"
[ "$(printf '%s\n' "$got" | grep -ci 'libssl/openssl')" = 1 ] && ok "the warnings are noted once" || bad "noted more than once: '$got'"

# 5. A query-engine 500 the flow did not notice still counts
run_case five "$(printf '%s\n%s' "$listening" "$query_engine_500")" "" 0 ""
[ "$(first_line)" = query-engine ] && ok "a query-engine 500 with exit 0 is query-engine" || bad "exit 0 with a 500: got '$got'"

# 5b. A 404 or another error class is not a query-engine error
run_case five-b "$(printf '[404] GET /nope\n[500] GET /map ContentError')" "" 0 ""
[ "$(first_line)" = passed ] && ok "other error classes are not query-engine" || bad "ContentError: got '$got'"

# 6. The record writer never writes the secrets of the run's .env
out="$work/record"
mkdir -p "$out/runs/1"
runner_token="0123456789abcdef0123456789abcdef0123456789abcdef"
auth_secret="fedcba9876543210fedcba9876543210fedcba9876543210"
printf 'ORIGIN=http://localhost:3000\nRUNNER_TOKEN=%s\nBETTER_AUTH_SECRET=%s\n' "$runner_token" "$auth_secret" >"$out/runs/1/.env"
printf '%s\n%s\n' "$query_engine_500" "log line that echoes $runner_token and $auth_secret" >"$out/runs/1/web.log"
printf 'query-engine\n%s\nreason echoing %s\n' "$query_engine_500" "$auth_secret" >"$out/runs/1/class.txt"
printf 'yes\n' >"$out/runs/1/alive.txt"
printf 'image: example:tag\ntoken in facts %s\n' "$runner_token" >"$out/facts.txt"
write_summary "$out" example:tag
status=$?
# 1 means the record was written and holds a query-engine error; 2 means no record could be published.
if [ "$status" = 1 ] && [ -s "$out/summary.md" ]; then ok "the record is written"; else bad "the record is not written (exit $status)"; fi
if grep -qF -e "$runner_token" -e "$auth_secret" "$out/summary.md" 2>/dev/null; then
  bad "summary.md holds a secret"
else
  ok "summary.md holds neither the Runner token nor the auth secret"
fi
grep -qF "query-engine" "$out/summary.md" && grep -qF "PrismaClientRustPanicError" "$out/summary.md" \
  && ok "the record keeps the run's class and line" || bad "the record lost the run's class or line"

# 6b. A record whose secrets cannot be found is not published
out="$work/record-b"
mkdir -p "$out/runs/1"
printf 'passed\n' >"$out/runs/1/class.txt"
write_summary "$out" example:tag
status=$?
[ "$status" = 2 ] && [ ! -e "$out/summary.md" ] && ok "no known secret to redact: no record" || bad "a record with nothing redacted was published (exit $status)"

# 7. The totals
out="$work/record-c"
mkdir -p "$out/runs/1" "$out/runs/2" "$out/runs/3"
printf 'passed\n' >"$out/runs/1/class.txt"
printf 'query-engine\n%s\n' "$query_engine_get" >"$out/runs/2/class.txt"
printf 'other\ntoomanyrequests\n' >"$out/runs/3/class.txt"
printf 'RUNNER_TOKEN=%s\nBETTER_AUTH_SECRET=%s\n' "$runner_token" "$auth_secret" >"$out/.env"
write_summary "$out" example:tag
status=$?
grep -qF 'runs=3 passed=1 query-engine=1 other=1' "$out/summary.md" \
  && ok "the totals count the classes" || bad "the totals: $(grep -i total "$out/summary.md")"
[ "$status" = 1 ] && ok "a query-engine run makes the exit 1" || bad "exit $status, wanted 1"

# 8. A route-less 500 is still a query-engine error
run_case eight "$(printf '%s\n%s' "$listening" '[500] GET (no route) PrismaClientRustPanicError')" "" 0 ""
[ "$(first_line)" = query-engine ] && ok "a (no route) PrismaClient 500 is query-engine" || bad "(no route): got '$got'"

# 9. A web log that is empty or missing is never passed
: >"$work/web.log"
: >"$work/runner.log"
got="$(classify_run "$work/web.log" "$work/runner.log" 0 "")"
[ "$(first_line)" = other ] && printf '%s\n' "$got" | grep -q "web log unreadable" \
  && ok "an empty web log is other, web log unreadable" || bad "empty web log: got '$got'"
got="$(classify_run "$work/missing.log" "$work/runner.log" 0 "")"
[ "$(first_line)" = other ] && ok "a missing web log is other" || bad "missing web log: got '$got'"

# 10. one_run: a web that never came up still has its log classified
out="$work/record-run"
mkdir -p "$out"
fresh_web() { return 1; }
compose() {
  if [ "$1" = logs ]; then
    case " $* " in *" web "*) printf '%s\n' "$FAKE_WEB_LOG" ;; esac
  fi
  return 0
}
curl() { echo 000; }
FAKE_WEB_LOG="$query_engine_get"
one_run "$out" 1 >/dev/null 2>&1
[ "$(head -n 1 "$out/runs/1/class.txt")" = query-engine ] && ok "a failed start-up with a PrismaClient line is query-engine" || bad "start-up failure: $(cat "$out/runs/1/class.txt")"
FAKE_WEB_LOG="$listening"
one_run "$out" 2 >/dev/null 2>&1
[ "$(head -n 1 "$out/runs/2/class.txt")" = other ] && grep -q "web did not answer /setup" "$out/runs/2/class.txt" \
  && ok "a failed start-up without one is other, with its reason" || bad "start-up failure: $(cat "$out/runs/2/class.txt")"
# compose logs that answers with a warning on stderr and nothing from web is not a pass
fresh_web() { return 0; }
printf '#!/bin/sh\nexit 0\n' >"$bin/timeout"
compose() {
  if [ "$1" = logs ]; then echo "warning: a stderr line only" >&2; fi
  return 0
}
one_run "$out" 3 >/dev/null 2>&1
[ "$(head -n 1 "$out/runs/3/class.txt")" = other ] && grep -q "web log unreadable" "$out/runs/3/class.txt" \
  && ok "a stderr warning and nothing from web is other, not passed" || bad "stderr-only logs: $(cat "$out/runs/3/class.txt")"
unset -f fresh_web compose curl
printf '#!/bin/sh\necho "stub timeout called: $*" >&2\nexit 99\n' >"$bin/timeout"

# 10b. compose_up: the first web never answering has its log classified and put in the record
out="$work/record-first"
mkdir -p "$out"
WORK_DIR="$work/first-work"
mkdir -p "$WORK_DIR"
docker() {
  case "$1" in
    run)
      printf 'RUNNER_TOKEN=%s\nBETTER_AUTH_SECRET=%s\n' "$runner_token" "$auth_secret" >"$WORK_DIR/instance/.env"
      : >"$WORK_DIR/instance/compose.yaml"
      ;;
  esac
  return 0
}
compose() { if [ "$1" = logs ]; then printf '%s\n' "$query_engine_500"; fi; return 0; }
wait_for_200() { return 1; }
compose_up "$out" example:tag >/dev/null 2>&1
status=$?
[ "$status" != 0 ] && [ "$(head -n 1 "$out/startup/class.txt" 2>/dev/null)" = query-engine ] \
  && ok "a first start-up that never answers is classified" || bad "first start-up: exit $status, class '$(cat "$out/startup/class.txt" 2>/dev/null)'"
write_summary "$out" example:tag >/dev/null 2>&1
status=$?
grep -q "First start-up" "$out/summary.md" && grep -qF "PrismaClientRustPanicError" "$out/summary.md" && [ "$status" = 1 ] \
  && ok "the record names the first start-up's class and line, and the job is red" || bad "record of a failed first start-up (exit $status)"
unset -f docker compose wait_for_200
SECRETS=()
INSTANCE=""
WORK_DIR=""
RUNNER_TOKEN_VALUE=""
AUTH_SECRET_VALUE=""
if [ "$(command -v docker)" != "$bin/docker" ]; then bad "the stub docker is no longer first on PATH"; fi

# 11. What reaches the job log is redacted and cannot be a workflow command
SECRETS=("$runner_token" "$auth_secret")
got="$(printf '%s\n' "::error::forged" "##[add-mask]x" '  ::error::x' 'text ##[error]x' $'a\r::error::x' 'x ##[stop-commands]t' "token $runner_token and $auth_secret" "plain" | log_safe)"
printf '%s\n' "$got" | grep -qE '^[[:space:]]*::|##\[' && bad "a workflow command got through: '$got'" || ok "no line can be a workflow command: ::, indented ::, ##[ anywhere, a lone CR"
[ "$(printf '%s' "$got" | tr -cd '\r' | wc -c)" = 0 ] && ok "no carriage return reaches the job log" || bad "a carriage return got through"
printf '%s\n' "$got" | grep -qF -e "$runner_token" -e "$auth_secret" && bad "a secret reached the job log" || ok "secrets are redacted from the job log"
printf '%s\n' "$got" | grep -qx "plain" && ok "other lines pass unchanged" || bad "plain line changed: '$got'"
SECRETS=()

# 12. Both generated values must be known before any record is written
out="$work/record-d"
mkdir -p "$out/runs/1"
printf 'passed\n' >"$out/runs/1/class.txt"
printf 'RUNNER_TOKEN=%s\n' "$runner_token" >"$out/.env"
write_summary "$out" example:tag 2>/dev/null
status=$?
[ "$status" = 2 ] && [ ! -e "$out/summary.md" ] && ok "one known secret is not enough: no record" || bad "one secret: exit $status"
printf 'RUNNER_TOKEN=%s\nBETTER_AUTH_SECRET=\n' "$runner_token" >"$out/.env"
write_summary "$out" example:tag 2>/dev/null
status=$?
[ "$status" = 2 ] && [ ! -e "$out/summary.md" ] && ok "an empty auth secret is not known: no record" || bad "empty auth secret: exit $status"

# 13. Output from the image cannot close the record's fence
out="$work/record-e"
mkdir -p "$out"
printf 'RUNNER_TOKEN=%s\nBETTER_AUTH_SECRET=%s\n' "$runner_token" "$auth_secret" >"$out/.env"
printf 'line one\n~~~~\n# Injected heading\n  ```\nafter\nx\r~~~~\n' >"$out/facts.txt"
write_summary "$out" example:tag 2>/dev/null
[ "$(grep -c '^~~~~$' "$out/summary.md")" = 2 ] && ! grep -qE '^ {0,3}```' "$out/summary.md" && ! grep -q $'\r' "$out/summary.md" \
  && ok "a fence line in the output, or after a lone CR, is indented, not a fence" || bad "fence break-out: $(grep -n '~~~~' "$out/summary.md")"

# 14. A stress with no status file is a failure, never a pass
out="$work/record-f"
mkdir -p "$out"
printf 'prisma-stress rounds=1 calls=7 errors=0\n' >"$out/stress-checkout.txt"
verdict "$out"
[ "$?" = 1 ] && ok "a stress output without a status is a failure" || bad "missing stress status passed"

# 15. Clean-up: a compose down that fails is said in the record's last line and fails the job; the teardown has a
# deadline and a kill-after, and a signal that arrives while it runs cannot abort it.
out="$work/record-g"
mkdir -p "$out" "$work/inst"
printf '# record\n' >"$out/summary.md"
: >"$work/inst/compose.yaml"
printf '#!/bin/sh\necho "$@" > "%s/timeout.args"\nkill -TERM "$CLEANUP_PID"\nkill -INT "$CLEANUP_PID"\nexit 99\n' "$work" >"$bin/timeout"
OUT_DIR="$out"
INSTANCE="$work/inst"
WORK_DIR=""
( export CLEANUP_PID=$BASHPID; cleanup ) 2>/dev/null
status=$?
[ "$status" = 1 ] && tail -n 1 "$out/summary.md" | grep -qi "clean-up failed.*did not finish within" \
  && ok "a failed compose down, hit by TERM and INT, is in the record and fails the job" || bad "failed clean-up: exit $status, last line '$(tail -n 1 "$out/summary.md")'"
grep -q -e "--kill-after=" "$work/timeout.args" && grep -qw "$CLEANUP_DEADLINE" "$work/timeout.args" \
  && ok "the teardown has a deadline and a kill-after" || bad "timeout args: $(cat "$work/timeout.args")"
printf '# record\n' >"$out/summary.md"
printf '#!/bin/sh\nexit 0\n' >"$bin/timeout"
( cleanup ) 2>/dev/null
status=$?
[ "$status" = 0 ] && [ "$(tail -n 1 "$out/summary.md")" = "# record" ] && ok "a clean clean-up changes nothing" || bad "clean clean-up: exit $status"

# 16. No secret known, no runs: still no record
out="$work/record-h"
mkdir -p "$out"
printf 'x\n' >"$out/facts.txt"
write_summary "$out" example:tag 2>/dev/null
status=$?
[ "$status" = 2 ] && [ ! -e "$out/summary.md" ] && ok "with no runs and no secret known, no record" || bad "no secrets, no runs: exit $status"

exit "$fail"
