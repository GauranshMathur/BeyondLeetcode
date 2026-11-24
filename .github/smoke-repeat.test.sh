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
got="$(printf '%s\n' "::error::forged" "##[add-mask]x" '  ::error::x' 'text ##[error]x' $'a\r::error::x' 'x ##[stop-commands]t' $'\xc2\xa0::error::x' $'\xc2\x85::stop-commands::t' $'\xe2\x80\x87::error::x' $'\xe3\x80\x80::error::x' "token $runner_token and $auth_secret" "plain" | log_safe)"
[ "$(printf '%s\n' "$got" | grep -vc '^| ')" = 0 ] && ! printf '%s\n' "$got" | grep -qF '##[' \
  && ok "every job-log line starts with '| ' (nothing starts a command, whatever whitespace precedes it) and none holds ##[" || bad "a line is not prefixed or holds ##[: '$got'"
[ "$(printf '%s' "$got" | tr -cd '\r' | wc -c)" = 0 ] && ok "no carriage return reaches the job log" || bad "a carriage return got through"
printf '%s\n' "$got" | grep -qF -e "$runner_token" -e "$auth_secret" && bad "a secret reached the job log" || ok "secrets are redacted from the job log"
printf '%s\n' "$got" | grep -qx "| plain" && ok "a plain line is only prefixed" || bad "plain line changed: '$got'"
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

# 13b. A CR in a table row or a stress summary line does not reach the record
out="$work/record-e2"
mkdir -p "$out/runs/1"
printf 'RUNNER_TOKEN=%s\nBETTER_AUTH_SECRET=%s\n' "$runner_token" "$auth_secret" >"$out/.env"
printf 'other\nreason one\r~~~~\n' >"$out/runs/1/class.txt"
printf 'prisma-stress rounds=1 calls=7 errors=0\r# Injected\n' >"$out/stress-checkout.txt"
printf '0\n' >"$out/stress-checkout.status"
write_summary "$out" example:tag >/dev/null 2>&1
! grep -q $'\r' "$out/summary.md" && ok "no carriage return in the record" || bad "a carriage return reached the record"

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

# 17. The fresh starts: the record shows the summary line and the error blocks, never the Runner token
out="$work/record-i"
mkdir -p "$out"
printf 'RUNNER_TOKEN=%s\nBETTER_AUTH_SECRET=%s\n' "$runner_token" "$auth_secret" >"$out/.env"
{
  echo '--- error: start 3, call run python'
  echo 'class: PrismaClientUnknownRequestError'
  echo "message: the engine said $runner_token"
  echo 'stack:'
  echo '    at somewhere (file.ts:1:1)'
  echo '--- end of error'
  echo 'prisma-fresh-start starts=4 calls=120 errors=1 failed-starts=0 not-printed=0 PrismaClientUnknownRequestError=1'
} >"$out/fresh-image.txt"
printf '1\n' >"$out/fresh-image.status"
write_summary "$out" example:tag >/dev/null 2>&1
status=$?
[ "$status" = 1 ] && grep -qF "## Fresh starts in the image" "$out/summary.md" \
  && grep -qF "prisma-fresh-start starts=4 calls=120 errors=1 failed-starts=0 not-printed=0" "$out/summary.md" \
  && grep -qF "PrismaClientUnknownRequestError" "$out/summary.md" && grep -qF "the engine said" "$out/summary.md" \
  && ! grep -qF "$runner_token" "$out/summary.md" \
  && ok "the record of the fresh starts shows the line, the class and the message, not the token" \
  || bad "fresh-start record (exit $status): $(cat "$out/summary.md" 2>/dev/null | head -n 40)"

# 18. A fence line, a three-backtick line and a lone CR in a fresh-start error block cannot close the record's fence
out="$work/record-j"
mkdir -p "$out"
printf 'RUNNER_TOKEN=%s\nBETTER_AUTH_SECRET=%s\n' "$runner_token" "$auth_secret" >"$out/.env"
printf -- '--- error: start 1, call map\nclass: Error\nmessage: m\nstack:\n~~~~\n# Injected\n  ```\nafter\nx\r~~~~\n--- end of error\nprisma-fresh-start starts=1 calls=2 errors=1 failed-starts=0 not-printed=0 Error=1\n' >"$out/fresh-checkout.txt"
printf '0\n' >"$out/fresh-checkout.status"
write_summary "$out" example:tag >/dev/null 2>&1
[ "$(grep -c '^~~~~$' "$out/summary.md")" = 2 ] && ! grep -qE '^ {0,3}```.' "$out/summary.md" \
  && [ "$(grep -cE '^ {0,3}```' "$out/summary.md")" = 2 ] && ! grep -q $'\r' "$out/summary.md" \
  && ok "fresh-start blocks cannot break out of the fence" || bad "fresh-start fence: $(grep -n -e '~~~~' -e '```' "$out/summary.md")"

# 19. Without a fresh-* file both sections say Not run, and the verdict stays clean
out="$work/record-k"
mkdir -p "$out"
printf 'RUNNER_TOKEN=%s\nBETTER_AUTH_SECRET=%s\n' "$runner_token" "$auth_secret" >"$out/.env"
write_summary "$out" example:tag >/dev/null 2>&1
status=$?
[ "$status" = 0 ] \
  && [ "$(sed -n '/^## Fresh starts in the image/,/^## /p' "$out/summary.md" | grep -c '^Not run\.$')" = 1 ] \
  && [ "$(sed -n '/^## Fresh starts from the checkout/,$p' "$out/summary.md" | grep -c '^Not run\.$')" -ge 1 ] \
  && ok "no fresh-* file: both sections say Not run and the verdict is 0" || bad "not run (exit $status)"

# 20. The verdict counts the fresh starts' status files
out="$work/record-l"
mkdir -p "$out"
printf '1\n' >"$out/fresh-checkout.status"
printf 'prisma-fresh-start starts=1 calls=1 errors=0 failed-starts=0 not-printed=0\n' >"$out/fresh-checkout.txt"
verdict "$out"
[ "$?" = 1 ] && ok "a fresh-checkout status of 1 is 1" || bad "fresh-checkout status 1 passed"
printf '0\n' >"$out/fresh-checkout.status"
verdict "$out"
[ "$?" = 0 ] && ok "a fresh-checkout status of 0 is 0" || bad "fresh-checkout status 0 failed"
out="$work/record-m"
mkdir -p "$out"
printf 'prisma-fresh-start starts=1 calls=1 errors=0 failed-starts=0 not-printed=0\n' >"$out/fresh-image.txt"
verdict "$out"
[ "$?" = 1 ] && ok "a fresh-image output with no status is 1" || bad "fresh-image without status passed"

# 21. The in-image pass mounts only the three files, read-only, passes the number of starts and no socket, and runs
# under a deadline with a kill-after, as the user bun, with the container removed on every path
out="$work/record-n"
mkdir -p "$out"
: >"$work/fresh-docker.calls"
: >"$work/fresh-timeout.args"
docker() { echo "$1" >>"$work/fresh-docker.calls"; if [ "$1" = run ]; then printf '%s\n' "$@" >"$work/fresh-docker.args"; echo "docker ran"; return 7; fi; return 0; }
timeout() { local a=""; while case "$1" in -* | [0-9]*) true ;; *) false ;; esac; do a="$a $1"; shift; done; echo "$a" >>"$work/fresh-timeout.args"; "$@"; }
fresh_in_image "$out" example:tag 5 /checkout/src/lib/server/prisma-fresh-start.bun-check.ts /checkout/src/lib/problem-wire.ts /checkout/src/lib/e2e-learner.ts
status=$?
args="$work/fresh-docker.args"
[ "$(grep -c '^-v$' "$args")" = 3 ] \
  && grep -qxF '/checkout/src/lib/server/prisma-fresh-start.bun-check.ts:/app/src/lib/server/prisma-fresh-start.bun-check.ts:ro' "$args" \
  && grep -qxF '/checkout/src/lib/problem-wire.ts:/app/src/lib/problem-wire.ts:ro' "$args" \
  && grep -qxF '/checkout/src/lib/e2e-learner.ts:/app/src/lib/e2e-learner.ts:ro' "$args" \
  && grep -qxF 'FRESH_STARTS=5' "$args" && ! grep -q 'docker.sock' "$args" && ! grep -q -e '--privileged' "$args" \
  && grep -qxF 'bun' "$args" \
  && ok "the in-image pass mounts the three files read-only and passes FRESH_STARTS" || bad "in-image args: $(tr '\n' ' ' <"$args")"
[ "$(grep -c '^-e$' "$args")" = 4 ] && grep -qxF 'HOME=/home/bun' "$args" && grep -qxF 'DATABASE_URL=file:/tmp/fresh.db' "$args" \
  && grep -qxF 'CONTENT_DIR=/app/content' "$args" && ! grep -q -e '--network' -e '--env-file' -e '--volumes-from' "$args" \
  && grep -qxF -e '--rm' "$args" && grep -qxF -e '--user' "$args" && grep -qxF 'bun' "$args" \
  && [ "$(grep -c '^--user$' "$args")" = 1 ] && [ "$(grep -A1 '^--user$' "$args" | tail -n 1)" = bun ] \
  && ok "the in-image pass runs --rm as the bun user with exactly four variables, no network flag and no other mount" || bad "in-image flags: $(tr '\n' ' ' <"$args")"
[ "$(cat "$out/fresh-image.status")" = 7 ] && grep -q "docker ran" "$out/fresh-image.txt" \
  && ok "the status file holds the stub's exit status" || bad "in-image status: $(cat "$out/fresh-image.status" 2>/dev/null)"
grep -q -e '--kill-after=' "$work/fresh-timeout.args" && grep -qE -e '--kill-after=[0-9]+ [0-9]+$' "$work/fresh-timeout.args" \
  && grep -qx run "$work/fresh-docker.calls" && grep -qx rm "$work/fresh-docker.calls" \
  && ok "the container runs under a deadline with a kill-after and is removed afterwards" || bad "deadline or removal: $(cat "$work/fresh-timeout.args" "$work/fresh-docker.calls" | tr '\n' ' ')"
unset -f docker timeout

# 22. The job-log line of the fresh starts is redacted, prefixed and cannot start a command; a per-child line and a
# CR never reach it raw
SECRETS=("$runner_token" "$auth_secret")
out="$work/record-o"
mkdir -p "$out"
printf 'noise\nprisma-fresh-start-child calls=1 errors=0 ##[error]\nprisma-fresh-start starts=2 calls=3 errors=0 failed-starts=0 not-printed=0 ##[error]x %s\rforged ::error::y\nprisma-fresh-start-child calls=9 after\n' "$runner_token" >"$out/fresh-image.txt"
got="$(log_fresh_line "$out/fresh-image.txt")"
case "$got" in
  '| prisma-fresh-start starts='*) printf '%s\n' "$got" | grep -qF '[redacted]' && ! printf '%s\n' "$got" | grep -qF "$runner_token" && ! printf '%s\n' "$got" | grep -qF '##[' \
    && [ "$(printf '%s\n' "$got" | wc -l)" = 1 ] && ! printf '%s' "$got" | grep -q $'\r' && ! printf '%s\n' "$got" | grep -q 'prisma-fresh-start-child' \
    && ok "the fresh-start job-log line is one prefixed, redacted line with no per-child line, no CR and no ##[" || bad "fresh-start log line: '$got'" ;;
  *) bad "fresh-start log line: '$got'" ;;
esac
SECRETS=()

# 23. A start that caught an error is a failed start: the record carries its process block and the verdict is red
out="$work/record-p"
mkdir -p "$out"
printf 'RUNNER_TOKEN=%s\nBETTER_AUTH_SECRET=%s\n' "$runner_token" "$auth_secret" >"$out/.env"
printf -- '--- error: start 1, process\nexit code 2\n    | prisma-fresh-start-child calls=3 core-calls=0 errors=1 other-errors=1 query-engine=0 Error=1\n--- end of error\nprisma-fresh-start starts=1 calls=3 errors=1 failed-starts=1 not-printed=0 Error=1\n' >"$out/fresh-image.txt"
printf '1\n' >"$out/fresh-image.status"
write_summary "$out" example:tag >/dev/null 2>&1
status=$?
[ "$status" = 1 ] && grep -qF 'failed-starts=1' "$out/summary.md" && grep -qF -- '--- error: start 1, process' "$out/summary.md" \
  && ok "a failed start's block and line are in the record and the verdict is 1" || bad "failed start record (exit $status)"

# 24. A block nested in a process block stays whole, and a child line that looks like the aggregate line is not taken
# for it when the parent never finished
out="$work/record-q"
mkdir -p "$out"
printf 'RUNNER_TOKEN=%s\nBETTER_AUTH_SECRET=%s\n' "$runner_token" "$auth_secret" >"$out/.env"
printf -- '--- error: start 1, process\nexit code 1\n    | --- error: start 1, call run\n    | --- end of error\n    | prisma-fresh-start starts=9 calls=9 errors=0\n    | tail line\n--- end of error\n  prisma-fresh-start starts=9 calls=9 errors=0 failed-starts=0 not-printed=0\n' >"$out/fresh-image.txt"
printf '1\n' >"$out/fresh-image.status"
write_summary "$out" example:tag >/dev/null 2>&1
[ "$(grep -c 'tail line' "$out/summary.md")" = 2 ] && grep -qF 'No summary line' "$out/summary.md" \
  && ! sed -n '/^## Fresh starts in the image/,/^## Fresh starts from/p' "$out/summary.md" | grep -q '^prisma-fresh-start starts=' \
  && ok "a nested marker does not end the process block, and an indented aggregate look-alike is not the summary" || bad "nested marker: $(sed -n '/^## Fresh starts in the image/,/^## Fresh starts from/p' "$out/summary.md")"

# 25. A line of a fresh-start summary that holds a CR or a fence cannot break the record's fences
out="$work/record-r"
mkdir -p "$out"
printf 'RUNNER_TOKEN=%s\nBETTER_AUTH_SECRET=%s\n' "$runner_token" "$auth_secret" >"$out/.env"
printf 'prisma-fresh-start starts=1 calls=1 errors=0 failed-starts=0 not-printed=0\r~~~~\r```\n' >"$out/fresh-checkout.txt"
printf '0\n' >"$out/fresh-checkout.status"
write_summary "$out" example:tag >/dev/null 2>&1
[ "$(grep -c '^~~~~$' "$out/summary.md")" = 0 ] && ! grep -q $'\r' "$out/summary.md" && [ "$(grep -cE '^ {0,3}```' "$out/summary.md")" = 2 ] \
  && ok "a fence or CR on the summary line stays inside it" || bad "summary line fence: $(sed -n '/^## Fresh starts from the checkout/,$p' "$out/summary.md" | head -12)"

# 26. The final secret check covers the fresh-start sections: a value that survives redaction means no record
out="$work/record-s"
mkdir -p "$out"
printf 'RUNNER_TOKEN=[redacted]\nBETTER_AUTH_SECRET=%s\n' "$auth_secret" >"$out/.env"
printf -- '--- error: start 1, call map\nclass: Error\nmessage:\n    [redacted]\nstack:\n--- end of error\nprisma-fresh-start starts=1 calls=1 errors=1 failed-starts=0 not-printed=0 Error=1\n' >"$out/fresh-image.txt"
printf '1\n' >"$out/fresh-image.status"
write_summary "$out" example:tag >/dev/null 2>&1
status=$?
[ "$status" = 2 ] && [ ! -e "$out/summary.md" ] && ok "a secret that survives redaction in a fresh-start section: no record" || bad "final secret check (exit $status)"

# 27. The number of starts: digits only, no leading zero is kept, 1 to 1000; a refusal never echoes the value
[ "$(whole_number 8 1000)" = 8 ] && [ "$(whole_number 08 1000)" = 8 ] && [ "$(whole_number 1000 1000)" = 1000 ] \
  && ok "a whole number is read as decimal, a leading zero dropped" || bad "whole_number: '$(whole_number 08 1000)'"
rejected=1
for v in '' 0 00 1001 1e3 0x10 2.0 -1 ' 1' $'1\n2' 12345678901234567890 '1+1' 18446744073709551617 $'\xd9\xa3'; do
  if (LC_ALL=C.UTF-8 whole_number "$v" 1000 >/dev/null 2>&1); then rejected=0; echo "accepted: '$v'"; fi
done
[ "$rejected" = 1 ] && ok "empty, zero, too large, exponent, hex, decimal point, sign, space and newline are refused" || bad "whole_number accepted a bad value"
msg="$( (FRESH_STARTS=$'3\n::error::forged' main example:tag 1 "$work/none") 2>&1)"
case "$msg" in
  *FRESH_STARTS*) printf '%s\n' "$msg" | grep -q 'forged' && bad "the refusal echoed the value: '$msg'" || ok "the refusal of FRESH_STARTS does not echo the value" ;;
  *) bad "no refusal: '$msg'" ;;
esac

# 28. The workflow's plan step: a leading zero is a number, a bad value is refused without being echoed
plan="$work/plan.sh"
sed -n '/^      - id: plan$/,/^  repeat:$/p' "$here/workflows/smoke-repeat.yml" | sed -n '/run: |/,/^  repeat:/p' | sed '1d;$d' | sed 's/^          //' >"$plan"
run_plan() { (cd "$work" && env -i PATH="$PATH" GITHUB_OUTPUT="$work/plan.out" IN_IMAGE= IN_JOBS=2 IN_RUNS=3 IN_ROUNDS=200 IN_STARTS=20 IN_BUN=1.2.19 "$@" bash "$plan" 2>&1); }
: >"$work/plan.out"
run_plan IN_STARTS=08 IN_RUNS=08 IN_ROUNDS=0100 >"$work/plan.log"
status=$?
grep -qx 'starts=8' "$work/plan.out" && grep -qx 'runs=8' "$work/plan.out" && grep -qx 'rounds=100' "$work/plan.out" && grep -qx 'minutes=125' "$work/plan.out" \
  && ok "the plan step reads 08 as 8 and works the minutes out" || bad "plan with leading zeros (exit $status): $(cat "$work/plan.out" "$work/plan.log" | tr '\n' ' ')"
: >"$work/plan.out"
run_plan IN_STARTS=$'3\n::stop-commands::x' >"$work/plan.log"
status=$?
[ "$status" != 0 ] && grep -q 'fresh_starts must be' "$work/plan.log" && ! grep -q 'stop-commands' "$work/plan.log" \
  && ok "the plan step refuses a bad fresh_starts without echoing it" || bad "plan with a bad value (exit $status): $(cat "$work/plan.log")"
: >"$work/plan.out"
run_plan IN_STARTS=1001 >"$work/plan.log"
[ "$?" != 0 ] && ok "the plan step refuses more than 1000 starts" || bad "1001 starts accepted"

# 29. A fresh-start output with no summary line: its last lines cannot break the record's fence
out="$work/record-t"
mkdir -p "$out"
printf 'RUNNER_TOKEN=%s\nBETTER_AUTH_SECRET=%s\n' "$runner_token" "$auth_secret" >"$out/.env"
printf 'migrated\n~~~~\n  ```\nx\r~~~~\n' >"$out/fresh-checkout.txt"
printf '124\n' >"$out/fresh-checkout.status"
write_summary "$out" example:tag >/dev/null 2>&1
grep -qF 'No summary line' "$out/summary.md" && [ "$(grep -c '^~~~~$' "$out/summary.md")" = 2 ] && ! grep -qE '^ {0,3}```' "$out/summary.md" \
  && ok "a fresh-start output with no summary line stays inside the fence" || bad "no-summary fence: $(grep -n -e '~~~~' -e '```' "$out/summary.md")"
grep -qi 'deadline' "$out/summary.md" && ok "a pass ended by its deadline is recorded as that" || bad "no deadline line for status 124"

# 30. No line of the record is longer than a fixed length, whatever the image printed
out="$work/record-u"
mkdir -p "$out"
printf 'RUNNER_TOKEN=%s\nBETTER_AUTH_SECRET=%s\n' "$runner_token" "$auth_secret" >"$out/.env"
long="$(head -c 6000 /dev/zero | tr '\0' 'y')"
printf '%s\n' "$long" >"$out/prisma-commands.txt"
printf '%s\n' "$long" >"$out/fresh-checkout.txt"
printf '124\n' >"$out/fresh-checkout.status"
write_summary "$out" example:tag >/dev/null 2>&1
[ "$(awk '{ if (length($0) > m) m = length($0) } END { print m + 0 }' "$out/summary.md")" -le 2000 ] \
  && ok "no line of the record, migration output and a summary-less tail included, is over 2000 characters" || bad "a record line is too long"
SECRETS=()
printf 'prisma-fresh-start starts=1 calls=1 errors=0 failed-starts=0 not-printed=0 %s\n' "$long" >"$out/fresh-image.txt"
got="$(log_fresh_line "$out/fresh-image.txt")"
[ "${#got}" -le 2100 ] && ok "the aggregate line is cut before it reaches the job log" || bad "a long aggregate line reached the job log whole (${#got})"

# 31. A pass killed mid-way leaves no container: the clean-up trap removes it by its name, under a deadline, and says
# so when it cannot
: >"$work/cleanup.calls"
docker() { printf '%s\n' "$*" >>"$work/cleanup.calls"; return "${DOCKER_RM_STATUS:-0}"; }
timeout() { echo "timeout $1" >>"$work/cleanup.calls"; while case "$1" in -* | [0-9]*) true ;; *) false ;; esac; do shift; done; "$@"; }
FRESH_CONTAINER="smoke-repeat-fresh-test"
OUT_DIR=""
INSTANCE=""
WORK_DIR=""
( cleanup ) 2>/dev/null
grep -qx 'rm -f smoke-repeat-fresh-test' "$work/cleanup.calls" && grep -q '^timeout ' "$work/cleanup.calls" \
  && ok "clean-up removes the fresh-start container by name, under a deadline" || bad "clean-up calls: $(cat "$work/cleanup.calls" | tr '\n' ' ')"
msg="$( (DOCKER_RM_STATUS=1 cleanup) 2>&1 )"
printf '%s\n' "$msg" | grep -q 'could not remove the fresh-start container' && ok "a failed removal is said, not ignored" || bad "silent failed removal: '$msg'"
FRESH_CONTAINER=""
unset -f docker timeout

# 32. The workflow's checkout pass goes through the shared job-log guard
grep -q 'log_fresh_line' "$here/workflows/smoke-repeat.yml" && ok "the checkout pass prints through log_fresh_line" || bad "the workflow no longer calls log_fresh_line"

# 33. A secret that straddles the 2000-character cut is redacted before the cut, in the record and in the job log
out="$work/record-v"
mkdir -p "$out"
printf 'RUNNER_TOKEN=%s\nBETTER_AUTH_SECRET=%s\n' "$runner_token" "$auth_secret" >"$out/.env"
pad="$(head -c 1990 /dev/zero | tr '\0' 'y')"
printf '%s%s tail\n' "$pad" "$runner_token" >"$out/facts.txt"
write_summary "$out" example:tag >/dev/null 2>&1
if grep -qF "${runner_token:0:8}" "$out/summary.md"; then bad "a part of the token survived the cut in the record"; else ok "a token spanning column 2000 leaves no part in the record"; fi
SECRETS=("$runner_token" "$auth_secret")
printf 'prisma-fresh-start starts=1 calls=1 errors=0 failed-starts=0 not-printed=0 %s%s\n' "${pad:0:1910}" "$runner_token" >"$out/fresh-image.txt"
got="$(log_fresh_line "$out/fresh-image.txt")"
if printf '%s\n' "$got" | grep -qF "${runner_token:0:8}"; then bad "a part of the token survived the cut in the job log"; else ok "a token spanning column 2000 leaves no part in the job log"; fi
SECRETS=()

# 34. The 137 sentence does not claim a deadline
out="$work/record-w"
mkdir -p "$out"
printf 'RUNNER_TOKEN=%s\nBETTER_AUTH_SECRET=%s\n' "$runner_token" "$auth_secret" >"$out/.env"
printf 'migrated\n' >"$out/fresh-checkout.txt"
printf '137\n' >"$out/fresh-checkout.status"
write_summary "$out" example:tag >/dev/null 2>&1
grep -qi 'out-of-memory' "$out/summary.md" && ! grep -qi "deadline ended it" "$out/summary.md" \
  && ok "status 137 is said to be a kill, the deadline's or the kernel's" || bad "137 text: $(grep -i -e killed -e deadline "$out/summary.md")"

# 35. The container's name comes from the environment, is removed under a bounded form, and is kept when removal fails
out="$work/record-x"
mkdir -p "$out"
: >"$work/fresh-docker.calls"; : >"$work/fresh-timeout.args"
docker() { echo "$1" >>"$work/fresh-docker.calls"; if [ "$1" = run ]; then printf '%s\n' "$@" >"$work/fresh-docker.args"; return 0; fi; return "${DOCKER_RM_STATUS:-0}"; }
timeout() { local a=""; while case "$1" in -* | [0-9]*) true ;; *) false ;; esac; do a="$a $1"; shift; done; echo "$a" >>"$work/fresh-timeout.args"; printf '%s\n' "$*" >>"$work/fresh-rm.args"; "$@"; }
: >"$work/fresh-rm.args"
FRESH_CONTAINER_NAME=smoke-repeat-fresh-1-2-3 fresh_in_image "$out" example:tag 5 /f /w /l
grep -qxF 'smoke-repeat-fresh-1-2-3' "$work/fresh-docker.args" && grep -qx -- '--name' "$work/fresh-docker.args" \
  && grep -qxF 'docker rm -f smoke-repeat-fresh-1-2-3' "$work/fresh-rm.args" && [ "$(grep -c -e '--kill-after=10 60' "$work/fresh-timeout.args")" -ge 1 ] \
  && ok "the container name comes from the environment and its removal is bounded" || bad "container name or removal: $(cat "$work/fresh-docker.args" "$work/fresh-rm.args" | tr '\n' ' ')"
FRESH_CONTAINER=kept-name
DOCKER_RM_STATUS=1 remove_fresh_container 2>/dev/null
[ "$FRESH_CONTAINER" = kept-name ] && ok "the name is kept after a failed removal" || bad "the name was forgotten after a failed removal"
FRESH_CONTAINER=""
unset -f docker timeout

# 36. The plan step refuses a combination that does not fit in 350 minutes, without echoing a value
: >"$work/plan.out"
run_plan IN_RUNS=30 IN_ROUNDS=20000 IN_STARTS=1000 >"$work/plan.log"
status=$?
[ "$status" != 0 ] && grep -q '350' "$work/plan.log" && ! grep -q 'minutes=' "$work/plan.out" \
  && ok "a combination over 350 minutes is refused, not capped" || bad "over-budget plan (exit $status): $(cat "$work/plan.log" "$work/plan.out" | tr '\n' ' ')"
: >"$work/plan.out"
run_plan IN_RUNS=10 IN_ROUNDS=500 IN_STARTS=100 >"$work/plan.log"
[ "$?" = 0 ] && grep -qx 'minutes=154' "$work/plan.out" && ok "a fitting combination passes with its minutes" || bad "fitting plan: $(cat "$work/plan.log" "$work/plan.out" | tr '\n' ' ')"

exit "$fail"
