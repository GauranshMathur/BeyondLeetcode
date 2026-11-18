#!/usr/bin/env bash
# Runs the Sandbox tests under one container engine on a GitHub-hosted runner, and writes a record of what it
# installed, every change it made to the host, the engine's version and mode, and which tests passed. It is the
# body of the on-demand sandbox-engines workflow and is never run on the maintainer's host: it installs packages
# and rewrites system files. A red result is the trial's finding, not a fault to retry away.
# Usage: .github/sandbox-engines.sh <docker|rootless-docker|podman|gvisor> <out-dir>   (from the repo root)
set -u
set -o pipefail

usage() {
  echo "usage: sandbox-engines.sh <docker|rootless-docker|podman|gvisor> <out-dir>" >&2
  exit 2
}
engine="${1:-}"
out_arg="${2:-}"
case "$engine" in
  docker | rootless-docker | podman | gvisor) ;;
  *) usage ;;
esac
[ -n "$out_arg" ] || usage

cd "$(dirname "$0")/.." || exit 1
mkdir -p "$out_arg" || exit 1
out="$(cd "$out_arg" && pwd)" || exit 1
work="$(mktemp -d)" || exit 1
trap 'rm -rf "$work"' EXIT

config=src/lib/server/runner/config.ts
user="$(id -un)"
uid="$(id -u)"
rootful_socket=/var/run/docker.sock

# Pinned versions. Each download below is checked with sha256sum -c against the value beside it.
# The runner image's own docker-ce (actions/runner-images, Ubuntu2404-Readme.md, image 20261111.370.1).
docker_ce_pin="5:28.0.4-1~ubuntu.24.04~noble"
# docker-ce-rootless-extras at the same version, from Docker's Ubuntu noble pool; the checksum is the SHA256 line of
# https://download.docker.com/linux/ubuntu/dists/noble/stable/binary-amd64/Packages.
rootless_extras_deb="docker-ce-rootless-extras_28.0.4-1~ubuntu.24.04~noble_amd64.deb"
rootless_extras_url="https://download.docker.com/linux/ubuntu/dists/noble/pool/stable/amd64/$rootless_extras_deb"
rootless_extras_sha256="2abb177d60561ac77b50a42b60500ab194b70f40f4b225d837c1fdccaaab7a28"
# gVisor release, and the checksum of its tarball from that release's SHA256SUMS.
gvisor_release="release-20261116.0"
gvisor_tarball="gvisor-x86_64.tar.bz2"
gvisor_url="https://github.com/gvisor/gvisor/releases/download/$gvisor_release/$gvisor_tarball"
gvisor_sha256="e22638939473759a8602e80f2b96a9b67e4afcdf58f2c51db52b1a8e9031ea45"
# Ubuntu 24.04 archive versions, checked by apt against Ubuntu's signature. Installed only when the runner lacks the package.
dbus_user_session_pin="1.14.10-4ubuntu4.1"
uidmap_pin="1:4.13+dfsg1-4ubuntu3.2"
slirp4netns_pin="1.2.1-1build2"

setup_failed=""
socket=""
images=()
problems=()
checks_started=""
pkgs_to_install=()
pkgs_present=()

# >>> helpers (the stub test in the scratch folder sources everything between these markers)

# Output shown, logged and put in the summary is stripped of anything that is not text, so a step can never put an
# image stream into the job log or an uploaded file. Over 64 KiB it is a head, a marker saying how much was cut, and
# a tail, because the last lines are where a step's error is.
printable() {
  local size
  size="$(wc -c <"$1")"
  if [ "$size" -le 65536 ]; then
    tr -c '\11\12\40-\176' '?' <"$1"
  else
    { head -c 16384 "$1"; printf '\n[... %s bytes cut ...]\n' "$((size - 49152))"; tail -c 32768 "$1"; } | tr -c '\11\12\40-\176' '?'
  fi
}

# A record the leg could not write makes the leg red.
write_failed() {
  case " ${problems[*]:-} " in
    *"could not write $1"*) ;;
    *) echo "::error::could not write $1"; problems+=("could not write $1") ;;
  esac
}

summary_add() { printf '%s\n' "$1" >>"$out/summary.md" || write_failed summary.md; }

fail_setup() {
  setup_failed="$1"
  echo "::error::could not set up $engine: $1"
  summary_add "## Tests"
  summary_add ""
  summary_add "Not tried: setup failed at $1"
  summary_add ""
  summary_add '```'
  if [ -f "$work/step.txt" ]; then tail -n 60 "$work/step.txt" >>"$out/summary.md"; fi
  summary_add '```'
  publish_summary
  exit 1
}

publish_summary() {
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then cat "$out/summary.md" >>"$GITHUB_STEP_SUMMARY" || write_failed '$GITHUB_STEP_SUMMARY'; fi
}

# run_step <step> <command> [args]: runs a command as given, never through a string; a failure stops the leg.
run_step() {
  local step="$1" rc
  shift
  echo "::group::$step"
  printf '+ '; printf '%q ' "$@"; echo
  "$@" >"$work/step.out" 2>&1
  rc=$?
  printable "$work/step.out" >"$work/step.txt"
  cat "$work/step.txt"
  echo "::endgroup::"
  { echo "== $step"; printf '+ '; printf '%q ' "$@"; echo; cat "$work/step.txt"; } >>"$out/setup.log" || write_failed setup.log
  [ "$rc" -eq 0 ] || fail_setup "$step"
}

# change <step> <command> [args]: the only way a command that changes the runner host runs. The exact command is
# written to changes.md and the summary first, so the list is what an operator would have to run.
change() {
  local line
  line="- $1: \`$(shift; printf '%q ' "$@")\`"
  printf '%s\n' "$line" >>"$out/changes.md" || write_failed changes.md
  summary_add "$line"
  run_step "$@"
}

# record <title> <command> [args]: puts a command's output in the summary; a failure of the command is shown, not fatal.
record() {
  local title="$1" rc
  shift
  if [ -z "$checks_started" ]; then
    checks_started=1
    summary_add ""
    summary_add "## Checks"
    summary_add ""
  fi
  "$@" >"$work/rec.out" 2>&1
  rc=$?
  {
    echo "### $title"
    echo
    echo '```'
    printable "$work/rec.out"
    [ "$rc" -eq 0 ] || echo "(exit status $rc)"
    echo '```'
    echo
  } >>"$out/summary.md" || write_failed summary.md
}

# Rootful Docker, whatever Docker context the client has been switched to.
rootful() { DOCKER_HOST="unix://$rootful_socket" "$@"; }

# Copies the images from the runner's own Docker into the engine under test: the loader command is the arguments.
# The tar stream goes through the pipe only; what a step captures is the loader's own text.
copy_images_into() { rootful docker save "${images[@]}" | "$@"; }

# Collects a package that the runner lacks, to be installed in one apt call.
need_package() {
  if dpkg -s "$1" >/dev/null 2>&1; then pkgs_present+=("$1"); else pkgs_to_install+=("$1=$2"); fi
}

install_missing_packages() {
  if [ "${#pkgs_to_install[@]}" -gt 0 ]; then
    change "refresh the apt package index" sudo apt-get update
    change "install the missing packages from the Ubuntu archive" sudo apt-get install -y "${pkgs_to_install[@]}"
    summary_add "- (the packages this script asked apt for, not the dependencies apt pulled in: ${pkgs_to_install[*]}; already present: ${pkgs_present[*]:-none})"
  else
    summary_add "- (nothing installed from the Ubuntu archive; already present: ${pkgs_present[*]:-none})"
  fi
}

docker_info() { DOCKER_HOST="unix://$socket" docker info --format "$1"; }

assert_docker_rootless() {
  local o
  o="$(docker_info '{{json .SecurityOptions}}')" || return 1
  case "$o" in *rootless*) ;; *) echo "SecurityOptions: $o"; return 1 ;; esac
}

assert_podman_rootless() {
  local o
  o="$(podman info)" || return 1
  grep -q 'rootless: true' <<<"$o" || { echo "podman info does not say rootless: true"; return 1; }
}

assert_default_runtime_runsc() {
  local o
  o="$(docker_info '{{.DefaultRuntime}}')" || return 1
  [ "$o" = runsc ] || { echo "default runtime is '$o'"; return 1; }
}

assert_dmesg_gvisor() {
  local o
  o="$(DOCKER_HOST="unix://$socket" docker run --rm --network none --memory 256m --memory-swap 256m "${images[-1]}" dmesg)" || return 1
  grep -qi gvisor <<<"$o" || { echo "dmesg does not name gVisor"; return 1; }
}

assert_runner_docker_ce() {
  local v
  v="$(dpkg-query -W -f='${Version}' docker-ce)" || return 1
  [ "$v" = "$docker_ce_pin" ] || { echo "the runner has docker-ce $v, the trial pins $docker_ce_pin"; return 1; }
}

user_cgroup_dir() { echo "/sys/fs/cgroup/user.slice/user-$uid.slice/user@$uid.service"; }

# The engine's own report, through the socket the tests use: cpu, memory and pids limits must be available. A user
# manager that never got the drop-in reports one of them missing.
assert_engine_limits() {
  local o
  o="$(docker_info '{{.CPUCfsQuota}} {{.MemoryLimit}} {{.PidsLimit}}')" || return 1
  [ "$o" = "true true true" ] || {
    echo "delegation did not take effect by the documented steps: the engine reports CPUCfsQuota MemoryLimit PidsLimit as '$o'"
    echo "warnings: $(docker_info '{{json .Warnings}}')"
    return 1
  }
}

show_user_cgroup() {
  echo "cgroup.controllers: $(cat "$(user_cgroup_dir)/cgroup.controllers")"
  echo "cgroup.subtree_control: $(cat "$(user_cgroup_dir)/cgroup.subtree_control")"
}

# Podman asked through the socket the tests use, so it describes the service and not this job step's own cgroup.
podman_remote() { podman --remote --url "unix://$socket" "$@"; }

# Podman's own report of the controllers it can use; the Docker-compatible info of 4.9.3 cannot show this
# (it reads CPUCfsQuota from a cgroup v1 file). An error from the command is an engine error, not a delegation failure.
assert_podman_controllers() {
  local o k
  o="$(podman_remote info --format '{{json .Host.CgroupControllers}}' 2>&1)" || { echo "podman info failed (an engine error, not a delegation result): $o"; return 1; }
  for k in cpu memory pids; do
    case "$o" in
      *"\"$k\""*) ;;
      *) echo "delegation did not take effect by the documented steps: Podman reports the controllers: $o"; return 1 ;;
    esac
  done
}

show_podman_service_unit() { systemctl --user cat podman.service; }

podman_docker_info_note() {
  echo "Podman 4.9.3's Docker-compatible info reports CPUCfsQuota false on cgroup v2 whatever the delegation; this is a record only."
  docker_info_text
}

podman_mode_fields() {
  local o
  o="$(podman_remote info)" || return 1
  grep -E -i 'rootless|cgroupVersion|cgroupManager|apparmor|seccomp|selinux|ociRuntime|^ +name: (crun|runc)' <<<"$o"
  grep -A12 -i 'cgroupControllers' <<<"$o"
}

wait_for_path() { # <test flag> <path>
  local _
  for _ in $(seq 1 60); do
    [ "$1" "$2" ] && return 0
    sleep 1
  done
  echo "nothing at $2"
  return 1
}

docker_info_text() {
  docker_info 'SecurityOptions={{json .SecurityOptions}}
CgroupVersion={{.CgroupVersion}}
CgroupDriver={{.CgroupDriver}}
DefaultRuntime={{.DefaultRuntime}}
Runtimes={{json .Runtimes}}
Warnings={{json .Warnings}}'
}
# <<< helpers

# What the engine sees after the documented steps, per rootless leg.
record_rootless_facts() {
  record "cgroup controllers of the user's systemd manager" show_user_cgroup
  record "sysctl kernel.apparmor_restrict_unprivileged_userns" sysctl kernel.apparmor_restrict_unprivileged_userns
}

# Rootless engines need subordinate ids, a user session that outlives the job, and the cgroup controllers delegated
# to it, because the Sandbox sets CPU, memory and pids limits.
prepare_rootless_user() {
  # Docker: https://docs.docker.com/engine/security/rootless/ (Prerequisites); Podman: the rootless tutorial,
  # https://github.com/containers/podman/blob/main/docs/tutorials/rootless_tutorial.md ("/etc/subuid and /etc/subgid configuration").
  need_package uidmap "$uidmap_pin"
  need_package dbus-user-session "$dbus_user_session_pin"
  [ "$engine" != rootless-docker ] || need_package slirp4netns "$slirp4netns_pin"
  install_missing_packages
  change "subordinate ids for $user" bash -o pipefail -c '{ grep -q "^$1:" /etc/subuid && grep -q "^$1:" /etc/subgid; } || sudo usermod --add-subuids 231072-296607 --add-subgids 231072-296607 "$1"' _ "$user"
  # Docker's "Limiting resources" (https://docs.docker.com/engine/security/rootless/tips/): the drop-in and a systemd
  # reload, and nothing more. On a hosted runner the user's manager may already be running (the image enables linger),
  # in which case this may not reach it; the docs give no further step, so what the engine sees is recorded below and
  # a missing controller fails the setup.
  change "delegate cgroup controllers to user sessions" sudo bash -o pipefail -c 'mkdir -p /etc/systemd/system/user@.service.d && printf "[Service]\nDelegate=cpu cpuset io memory pids\n" >/etc/systemd/system/user@.service.d/delegate.conf'
  change "reload systemd" sudo systemctl daemon-reload
  change "enable linger for $user" sudo loginctl enable-linger "$user"
  export XDG_RUNTIME_DIR="/run/user/$uid"
  export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
  run_step "wait for the user session of $user" wait_for_path -S "$XDG_RUNTIME_DIR/bus"
}

mapfile -t images < <(grep -o "ghcr.io/[a-z/-]*sandbox-[a-z]*:[0-9]*" "$config")
python_image="$(sed -n "s/^const pythonImage = '\(.*\)';/\1/p" "$config")"
{ echo "# Sandbox tests under $engine"; echo; } >"$out/summary.md" || exit 1
echo "# Changes this trial made to the runner host" >"$out/changes.md" || exit 1
: >"$out/setup.log" || exit 1
{
  echo "- Commit: $(git rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "- Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "- Kernel: $(uname -r)"
  echo "- Runner image: ${ImageOS:-unknown} ${ImageVersion:-unknown}"
  echo "- CPUs (nproc): $(nproc)"
  echo
} >>"$out/summary.md" || exit 1

[ "${#images[@]}" -gt 0 ] || fail_setup "read the Sandbox image names from $config"
if ! printf '%s' "$python_image" | grep -Eq '^[a-z0-9./:-]+$'; then fail_setup "read the Python image name from $config (got an unexpected value)"; fi
images+=("$python_image")

# The Sandbox images, built on the runner's own Docker before any engine is changed.
run_step "build the Sandbox images" rootful .github/build-sandbox-images.sh
run_step "pull the Python image" rootful docker pull "$python_image"

summary_add "## Installed, and from where"
summary_add ""
case "$engine" in
  docker)
    summary_add "- Nothing. The runner image's own Docker, docker-ce $(dpkg-query -W -f='${Version}' docker-ce 2>/dev/null || echo unknown), is used as ci's sandbox job uses it."
    ;;
  rootless-docker)
    summary_add "- docker-ce-rootless-extras, \`$rootless_extras_deb\`, from $rootless_extras_url, sha256 $rootless_extras_sha256 (the SHA256 line of Docker's noble Packages index), at the version of the runner image's own docker-ce."
    summary_add "- uidmap $uidmap_pin, dbus-user-session $dbus_user_session_pin and slirp4netns $slirp4netns_pin from the Ubuntu 24.04 archive, each only when the runner lacks it; the host-change list says which were installed."
    ;;
  podman)
    summary_add "- Nothing from outside the runner image: its own Podman is used (4.9.3 in the runner image's README)."
    summary_add "- uidmap $uidmap_pin and dbus-user-session $dbus_user_session_pin from the Ubuntu 24.04 archive, each only when the runner lacks it; the host-change list says which were installed."
    ;;
  gvisor)
    summary_add "- runsc, containerd-shim-runsc-v1 and gvisor-bin/ from \`$gvisor_tarball\` of gVisor $gvisor_release, $gvisor_url, sha256 $gvisor_sha256 (from that release's SHA256SUMS), into /usr/local/bin."
    ;;
esac
summary_add ""
summary_add "## Host changes, in order"
summary_add ""

case "$engine" in
  docker)
    socket="$rootful_socket"
    record "docker version" env "DOCKER_HOST=unix://$socket" docker version
    record "docker info" docker_info_text
    record "sysctl kernel.apparmor_restrict_unprivileged_userns" sysctl kernel.apparmor_restrict_unprivileged_userns
    ;;

  rootless-docker)
    run_step "the runner's docker-ce is the pinned version" assert_runner_docker_ce
    prepare_rootless_user
    change "download docker-ce-rootless-extras, checked against the pinned sha256" bash -o pipefail -c 'cd "$1" && curl -fsSLO "$2" && echo "$3  $4" | sha256sum -c -' _ "$work" "$rootless_extras_url" "$rootless_extras_sha256" "$rootless_extras_deb"
    change "install docker-ce-rootless-extras" sudo dpkg -i "$work/$rootless_extras_deb"
    # Docker's rootless Troubleshoot page (https://docs.docker.com/engine/security/rootless/troubleshoot/, "Distribution-specific
    # hint", Ubuntu tab): with the deb package the rootlesskit AppArmor profile comes with the apparmor package, so
    # nothing is added and the restriction on user namespaces stays on for the whole host.
    run_step "the rootlesskit AppArmor profile is installed" test -f /etc/apparmor.d/rootlesskit
    # Docker's Install section: the setup tool; --force because the runner's rootful daemon keeps running to
    # build the images and to be the source of the copy.
    change "set up rootless Docker for $user" dockerd-rootless-setuptool.sh install --force
    socket="$XDG_RUNTIME_DIR/docker.sock"
    run_step "wait for the socket $socket" wait_for_path -S "$socket"
    run_step "Docker reports rootless" assert_docker_rootless
    record "docker version" env "DOCKER_HOST=unix://$socket" docker version
    record "docker info" docker_info_text
    record_rootless_facts
    run_step "the engine reports cpu, memory and pids limits available" assert_engine_limits
    run_step "copy the Sandbox images into rootless Docker" copy_images_into env "DOCKER_HOST=unix://$socket" docker load
    ;;

  podman)
    prepare_rootless_user
    # Ubuntu's blog on restricted unprivileged user namespaces
    # (https://ubuntu.com/blog/ubuntu-23-10-restricted-unprivileged-user-namespaces) says the profiles for the
    # affected programs ship in the apparmor package, and the 24.04 release notes
    # (https://documentation.ubuntu.com/release-notes/24.04/) announce the restriction. The apparmor package of 24.04 has
    # a podman profile, so the host-wide restriction stays on; the script checks the file and records the sysctl.
    run_step "the podman AppArmor profile is installed" test -f /etc/apparmor.d/podman
    # Podman's socket activation tutorial: https://github.com/containers/podman/blob/main/docs/tutorials/socket_activation.md
    change "start the user's podman.socket" systemctl --user start podman.socket
    socket="$XDG_RUNTIME_DIR/podman/podman.sock"
    run_step "wait for the socket $socket" wait_for_path -S "$socket"
    run_step "Podman reports rootless" assert_podman_rootless
    # The tests talk to the socket, so the mode is asserted through it as well.
    run_step "the socket reports rootless" assert_docker_rootless
    record "podman version" podman version
    record "podman info (mode fields and cgroup controllers)" podman_mode_fields
    record "the socket's docker info (a record only)" podman_docker_info_note
    record "podman.service unit (whether it has Delegate=true)" show_podman_service_unit
    record_rootless_facts
    run_step "Podman reports the cpu, memory and pids controllers" assert_podman_controllers
    run_step "copy the Sandbox images into Podman" copy_images_into podman load
    ;;

  gvisor)
    # gVisor's installation guide ("Install latest release") and Docker Quick Start.
    change "download gVisor, checked against the pinned sha256" bash -o pipefail -c 'cd "$1" && curl -fsSLO "$2" && echo "$3  $4" | sha256sum -c -' _ "$work" "$gvisor_url" "$gvisor_sha256" "$gvisor_tarball"
    change "install gVisor into /usr/local/bin" sudo tar -xjf "$work/$gvisor_tarball" -C /usr/local/bin
    change "register the runsc runtime with Docker" sudo /usr/local/bin/runsc install
    # The Runner names no runtime on a container, so the default runtime is the only way to run it under gVisor.
    change "make runsc Docker's default runtime" bash -o pipefail -c 'jq "$1" /etc/docker/daemon.json | sudo tee /etc/docker/daemon.json.new >/dev/null && sudo mv /etc/docker/daemon.json.new /etc/docker/daemon.json' _ '."default-runtime" = "runsc"'
    change "restart Docker" sudo systemctl restart docker
    socket="$rootful_socket"
    run_step "Docker's default runtime is runsc" assert_default_runtime_runsc
    # The Docker Quick Start's check; an attacker can fake it, so it shows the setup took effect, nothing more.
    run_step "a container's dmesg names gVisor" assert_dmesg_gvisor
    record "runsc --version" runsc --version
    record "docker version" env "DOCKER_HOST=unix://$socket" docker version
    record "docker info" docker_info_text
    record "sysctl kernel.apparmor_restrict_unprivileged_userns" sysctl kernel.apparmor_restrict_unprivileged_userns
    ;;
esac

# >>> tests (the stub test in the scratch folder sources this and runs it in a subshell)
# Totals and the full name of every failed test, from the junit file.
junit_report_py='
import sys
import xml.etree.ElementTree as ET

root = ET.parse(sys.argv[1]).getroot()
total = failed = skipped = 0
names = []
for case in root.iter("testcase"):
    total += 1
    if case.find("skipped") is not None:
        skipped += 1
    elif case.find("failure") is not None or case.find("error") is not None:
        failed += 1
        names.append(case.get("classname", "") + " > " + case.get("name", ""))
print("Tests: %d, passed: %d, failed: %d, skipped: %d" % (total, total - failed - skipped, failed, skipped))
print()
for name in names:
    print("- FAILED: " + name)
'

after_setup() {
  # The Sandbox tests. DOCKER_SOCKET is what the tests' engine and their Runner process read; DOCKER_HOST is for the
  # docker command some tests call. The exit status is kept, not acted on.
  echo "::group::bun run test:sandbox"
  DOCKER_SOCKET="$socket" DOCKER_HOST="unix://$socket" SANDBOX_CONCURRENCY=2 \
    bun run test:sandbox --reporter=default --reporter=junit --outputFile.junit="$out/junit.xml" 2>&1 | tee "$out/test-output.log"
  statuses=("${PIPESTATUS[@]}")
  test_status="${statuses[0]:-1}"
  tee_status="${statuses[1]:-1}"
  echo "::endgroup::"
  [ "$tee_status" -eq 0 ] || problems+=("could not write test-output.log")
  [ "$test_status" -eq 0 ] || problems+=("bun run test:sandbox exited $test_status")

  summary_add ""
  summary_add "## Tests"
  summary_add ""
  summary_add "Exit status of \`bun run test:sandbox\`: $test_status"
  summary_add ""
  ratio="$(grep -h 'three busy processes used' "$out/test-output.log" 2>/dev/null | head -n 1)"
  summary_add "CPU ratio line from the test: ${ratio:-not found in the test output}"
  summary_add ""
  retries="$(grep -c 'Content check retried' "$out/test-output.log" 2>/dev/null)"
  summary_add "Content check retries (a retried case still counts as passed): ${retries:-0}"
  summary_add ""
  if [ -s "$out/junit.xml" ]; then
    if python3 -I -c "$junit_report_py" "$out/junit.xml" >"$work/junit.txt" 2>&1
    then
      printable "$work/junit.txt" >>"$out/summary.md" || write_failed summary.md
    else
      summary_add "The junit file could not be read:"
      printable "$work/junit.txt" >>"$out/summary.md"
      problems+=("the junit file could not be read")
    fi
  else
    summary_add "No junit file was written after the test step."
    problems+=("no junit file was written after the test step")
  fi
  summary_add ""

  # Containers the Runner should have removed, polled for up to 120 s.
  summary_add "## Leftover containers"
  summary_add ""
  left=""
  query_failed=""
  for _ in $(seq 1 24); do
    if left="$(DOCKER_HOST="unix://$socket" docker ps -a --filter label=beyondleetcode.runner --format '{{.Names}} {{.State}}' 2>&1)"; then
      query_failed=""
    else
      query_failed=1
      break
    fi
    [ -z "$left" ] && break
    sleep 5
  done
  if [ -n "$query_failed" ]; then
    summary_add "The leftover check failed: $(printf '%s' "$left" | head -c 2000 | tr -c '\11\12\40-\176' '?')"
    problems+=("the leftover check failed")
  elif [ -n "$left" ]; then
    summary_add "Left after 120 s:"
    summary_add ""
    summary_add '```'
    summary_add "$(printf '%s' "$left" | head -c 4000 | tr -c '\11\12\40-\176' '?')"
    summary_add '```'
    problems+=("containers were left behind")
  else
    summary_add "None left."
  fi

  if [ "${#problems[@]}" -gt 0 ]; then
    summary_add ""
    summary_add "## Why this leg is red"
    summary_add ""
    for p in "${problems[@]}"; do summary_add "- $p"; done
  fi
  publish_summary

  [ "${#problems[@]}" -eq 0 ] || exit 1
  exit 0
}
# <<< tests

after_setup
