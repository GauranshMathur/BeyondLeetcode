#!/usr/bin/env bash
# Runs the Sandbox tests under one container engine on a GitHub-hosted runner, and writes a record of what it
# installed, every change it made to the host, the engine's version and mode, and which tests passed. It is the
# body of the on-demand sandbox-engines workflow and is never run on the maintainer's host: it installs packages
# and rewrites system files. A red result is the trial's finding, not a fault to retry away.
# Usage: .github/sandbox-engines.sh <docker|rootless-docker|podman|gvisor> <out-dir>   (from the repo root)
set -u

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

cd "$(dirname "$0")/.."
mkdir -p "$out_arg"
out="$(cd "$out_arg" && pwd)"
work="$(mktemp -d)"
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

: >"$out/changes.md"
: >"$out/setup.log"
: >"$work/checks.md"
: >"$work/tests.md"
: >"$work/leftovers.md"
echo "# Changes this trial made to the runner host" >"$out/changes.md"
echo >>"$out/changes.md"

installed=""
setup_failed=""
socket=""

# The summary, written on every way out of the script after the setup starts.
write_summary() {
  {
    echo "# Sandbox tests under $engine"
    echo
    echo "- Commit: $(git rev-parse HEAD 2>/dev/null || echo unknown)"
    echo "- Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "- Kernel: $(uname -r)"
    echo "- Runner image: ${ImageOS:-unknown} ${ImageVersion:-unknown}"
    echo "- CPUs (nproc): $(nproc)"
    echo
    echo "## Installed, and from where"
    echo
    printf '%s\n' "$installed"
    echo
    echo "## Host changes, in order"
    echo
    tail -n +3 "$out/changes.md"
    echo
    echo "## Checks"
    echo
    cat "$work/checks.md"
    if [ -n "$setup_failed" ]; then
      echo "## Tests"
      echo
      echo "Not tried: setup failed at $setup_failed"
      echo
      echo '```'
      tail -n 60 "$work/step.out" 2>/dev/null
      echo '```'
    else
      echo "## Tests"
      echo
      cat "$work/tests.md"
      echo "## Leftover containers"
      echo
      cat "$work/leftovers.md"
    fi
  } >"$out/summary.md"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then cat "$out/summary.md" >>"$GITHUB_STEP_SUMMARY"; fi
}

fail_setup() {
  setup_failed="$1"
  echo "::error::could not set up $engine: $1"
  write_summary
  exit 1
}

# run_step <step> <command>: runs a command for the setup; a failure stops the leg.
run_step() {
  local step="$1" cmd="$2" rc
  echo "::group::$step"
  echo "+ $cmd"
  bash -o pipefail -c "$cmd" >"$work/step.out" 2>&1
  rc=$?
  cat "$work/step.out"
  echo "::endgroup::"
  { echo "== $step"; echo "+ $cmd"; cat "$work/step.out"; } >>"$out/setup.log"
  [ "$rc" -eq 0 ] || fail_setup "$step"
}

# change <step> <command>: the only way a command that changes the runner host runs. The exact command is
# appended to changes.md first, so the list is what an operator would have to run.
change() {
  printf -- '- %s: `%s`\n' "$1" "$2" >>"$out/changes.md"
  run_step "$1" "$2"
}

# record <title> <command>: puts a command's output in the summary; a failure of the command is shown, not fatal.
record() {
  {
    echo "### $1"
    echo
    echo '```'
    bash -o pipefail -c "$2" 2>&1
    echo '```'
    echo
  } >>"$work/checks.md"
}

# Rootful Docker, whatever Docker context the client has been switched to.
rootful() { DOCKER_HOST="unix://$rootful_socket" "$@"; }

images="$(grep -o "ghcr.io/[a-z/-]*sandbox-[a-z]*:[0-9]*" "$config")"
python_image="$(sed -n "s/^const pythonImage = '\(.*\)';/\1/p" "$config")"
[ -n "$images" ] && [ -n "$python_image" ] || fail_setup "read the image names from $config"
images="$images $python_image"

# The Sandbox images, built on the runner's own Docker before any engine is changed.
run_step "build the Sandbox images" "DOCKER_HOST=unix://$rootful_socket .github/build-sandbox-images.sh"
run_step "pull the Python image" "DOCKER_HOST=unix://$rootful_socket docker pull $python_image"

# Rootless engines need subordinate ids, a user session that outlives the job, and the cgroup controllers delegated
# to it, because the Sandbox sets CPU, memory and pids limits.
prepare_rootless_user() {
  # Docker: https://docs.docker.com/engine/security/rootless/ (Prerequisites); Podman: the rootless tutorial,
  # https://github.com/containers/podman/blob/main/docs/tutorials/rootless_tutorial.md ("/etc/subuid and /etc/subgid configuration").
  change "refresh the apt package index" "sudo apt-get update"
  change "install uidmap if missing" "dpkg -s uidmap >/dev/null 2>&1 || sudo apt-get install -y uidmap=$uidmap_pin"
  change "install dbus-user-session if missing" "dpkg -s dbus-user-session >/dev/null 2>&1 || sudo apt-get install -y dbus-user-session=$dbus_user_session_pin"
  change "subordinate ids for $user" "{ grep -q '^$user:' /etc/subuid && grep -q '^$user:' /etc/subgid; } || sudo usermod --add-subuids 231072-296607 --add-subgids 231072-296607 $user"
  # Docker's "Limiting resources" (https://docs.docker.com/engine/security/rootless/tips/): delegate the controllers
  # to user sessions. Written before linger starts the user's systemd, so the session is born with them.
  change "delegate cgroup controllers to user sessions" "sudo mkdir -p /etc/systemd/system/user@.service.d && printf '[Service]\nDelegate=cpu cpuset io memory pids\n' | sudo tee /etc/systemd/system/user@.service.d/delegate.conf >/dev/null"
  change "reload systemd" "sudo systemctl daemon-reload"
  change "enable linger for $user" "sudo loginctl enable-linger $user"
  export XDG_RUNTIME_DIR="/run/user/$uid"
  export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
  run_step "wait for the user session of $user" 'for _ in $(seq 1 60); do [ -S "$XDG_RUNTIME_DIR/bus" ] && exit 0; sleep 1; done; echo "no user bus at $XDG_RUNTIME_DIR/bus"; exit 1'
}

wait_for_socket() {
  run_step "wait for the socket $1" "for _ in \$(seq 1 60); do [ -S '$1' ] && exit 0; sleep 1; done; echo 'no socket at $1'; exit 1"
}

# Copies the images from the runner's own Docker into the engine under test.
copy_images() {
  run_step "copy the Sandbox images into $engine" "DOCKER_HOST=unix://$rootful_socket docker save $images | $1"
}

record_host_facts() {
  record "sysctl kernel.apparmor_restrict_unprivileged_userns" "sysctl kernel.apparmor_restrict_unprivileged_userns"
}

record_user_cgroups() {
  record "Cgroup controllers delegated to $user" "cat /sys/fs/cgroup/user.slice/user-$uid.slice/user@$uid.service/cgroup.controllers"
}

record_docker_info() {
  record "docker info" "DOCKER_HOST=unix://$socket docker info --format 'SecurityOptions={{json .SecurityOptions}}
CgroupVersion={{.CgroupVersion}}
CgroupDriver={{.CgroupDriver}}
DefaultRuntime={{.DefaultRuntime}}
Runtimes={{json .Runtimes}}'"
}

case "$engine" in
  docker)
    socket="$rootful_socket"
    installed="- Nothing. The runner image's own Docker (docker-ce $docker_ce_pin) is used as ci's sandbox job uses it."
    record "docker version" "DOCKER_HOST=unix://$socket docker version"
    record_docker_info
    record_host_facts
    ;;

  rootless-docker)
    installed="- docker-ce-rootless-extras, \`$rootless_extras_deb\`, from $rootless_extras_url, sha256 $rootless_extras_sha256 (the SHA256 line of Docker's noble Packages index), at the version of the runner image's own docker-ce.
- uidmap $uidmap_pin, dbus-user-session $dbus_user_session_pin, from the Ubuntu 24.04 archive, only when the runner lacks them."
    run_step "the runner's docker-ce is the pinned version" "[ \"\$(dpkg-query -W -f='\${Version}' docker-ce)\" = '$docker_ce_pin' ] || { echo \"the runner has docker-ce \$(dpkg-query -W -f='\${Version}' docker-ce), the trial pins $docker_ce_pin\"; exit 1; }"
    prepare_rootless_user
    change "install slirp4netns if missing" "dpkg -s slirp4netns >/dev/null 2>&1 || sudo apt-get install -y slirp4netns=$slirp4netns_pin"
    change "download docker-ce-rootless-extras, checked against the pinned sha256" "cd $work && curl -fsSLO '$rootless_extras_url' && echo '$rootless_extras_sha256  $rootless_extras_deb' | sha256sum -c -"
    change "install docker-ce-rootless-extras" "sudo dpkg -i $work/$rootless_extras_deb"
    # Docker's Rootless mode, Ubuntu tab: with the deb package the rootlesskit AppArmor profile comes with the
    # apparmor package, so nothing is added and the restriction on user namespaces stays on for the whole host.
    run_step "the rootlesskit AppArmor profile is installed" "test -f /etc/apparmor.d/rootlesskit"
    # Docker's Install section: the setup tool; --force because the runner's rootful daemon keeps running to
    # build the images and to be the source of the copy.
    change "set up rootless Docker for $user" "dockerd-rootless-setuptool.sh install --force"
    socket="$XDG_RUNTIME_DIR/docker.sock"
    wait_for_socket "$socket"
    run_step "Docker reports rootless" "DOCKER_HOST=unix://$socket docker info --format '{{json .SecurityOptions}}' | grep -q rootless"
    record "docker version" "DOCKER_HOST=unix://$socket docker version"
    record_docker_info
    record_user_cgroups
    record_host_facts
    copy_images "DOCKER_HOST=unix://$socket docker load"
    ;;

  podman)
    installed="- Nothing from outside the runner image: its own Podman is used (4.9.3 in the runner image's README).
- uidmap $uidmap_pin, dbus-user-session $dbus_user_session_pin, from the Ubuntu 24.04 archive, only when the runner lacks them."
    prepare_rootless_user
    # The apparmor package of Ubuntu 24.04 ships a profile that lets /usr/bin/podman create user namespaces
    # (packages.ubuntu.com/noble/amd64/apparmor/filelist), so the host-wide restriction stays on.
    run_step "the podman AppArmor profile is installed" "test -f /etc/apparmor.d/podman"
    # Podman's socket activation tutorial: https://github.com/containers/podman/blob/main/docs/tutorials/socket_activation.md
    change "start the user's podman.socket" "systemctl --user start podman.socket"
    socket="$XDG_RUNTIME_DIR/podman/podman.sock"
    wait_for_socket "$socket"
    run_step "Podman reports rootless" "podman info | grep -q 'rootless: true'"
    record "podman version" "podman version"
    record "podman info (mode fields)" "podman info | grep -E -i 'rootless|cgroup|apparmor|seccomp|selinux|ociRuntime|^ +name: (crun|runc)'"
    record_user_cgroups
    record_host_facts
    copy_images "podman load"
    ;;

  gvisor)
    installed="- runsc, containerd-shim-runsc-v1 and gvisor-bin/ from \`$gvisor_tarball\` of gVisor $gvisor_release, $gvisor_url, sha256 $gvisor_sha256 (from that release's SHA256SUMS), into /usr/local/bin."
    # gVisor's installation guide ("Install latest release") and Docker Quick Start.
    change "download gVisor, checked against the pinned sha256" "cd $work && curl -fsSLO '$gvisor_url' && echo '$gvisor_sha256  $gvisor_tarball' | sha256sum -c -"
    change "install gVisor into /usr/local/bin" "sudo tar -xjf $work/$gvisor_tarball -C /usr/local/bin"
    change "register the runsc runtime with Docker" "sudo /usr/local/bin/runsc install"
    # The Runner names no runtime on a container, so the default runtime is the only way to run it under gVisor.
    change "make runsc Docker's default runtime" "jq '.\"default-runtime\" = \"runsc\"' /etc/docker/daemon.json | sudo tee /etc/docker/daemon.json.new >/dev/null && sudo mv /etc/docker/daemon.json.new /etc/docker/daemon.json"
    change "restart Docker" "sudo systemctl restart docker"
    socket="$rootful_socket"
    run_step "Docker's default runtime is runsc" "[ \"\$(DOCKER_HOST=unix://$socket docker info --format '{{.DefaultRuntime}}')\" = runsc ]"
    # The Docker Quick Start's check; an attacker can fake it, so it shows the setup took effect, nothing more.
    run_step "a container's dmesg names gVisor" "DOCKER_HOST=unix://$socket docker run --rm --network none --memory 256m --memory-swap 256m $python_image dmesg | grep -i gvisor"
    record "runsc --version" "runsc --version"
    record "docker version" "DOCKER_HOST=unix://$socket docker version"
    record_docker_info
    record_host_facts
    ;;
esac

# The Sandbox tests. DOCKER_SOCKET is what the tests' engine and their Runner process read; DOCKER_HOST is for the
# docker command some tests call. The exit status is kept, not acted on.
echo "::group::bun run test:sandbox"
DOCKER_SOCKET="$socket" DOCKER_HOST="unix://$socket" SANDBOX_CONCURRENCY=2 \
  bun run test:sandbox --reporter=default --reporter=junit --outputFile.junit="$out/junit.xml" 2>&1 | tee "$out/test-output.log"
test_status="${PIPESTATUS[0]}"
echo "::endgroup::"

{
  echo "Exit status of \`bun run test:sandbox\`: $test_status"
  echo
  echo "CPUs the host has: $(nproc)"
  echo
  ratio="$(grep -h 'three busy processes used' "$out/test-output.log" | head -n 1)"
  echo "CPU ratio line from the test: ${ratio:-not found in the test output}"
  echo
  if [ -s "$out/junit.xml" ]; then
    python3 -I - "$out/junit.xml" <<'PY'
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
        names.append(f'{case.get("classname", "")} > {case.get("name", "")}')
print(f"Tests: {total}, passed: {total - failed - skipped}, failed: {failed}, skipped: {skipped}")
print()
for name in names:
    print(f"- FAILED: {name}")
PY
  else
    echo "No junit file was written."
  fi
  echo
} >"$work/tests.md"

# Containers the Runner should have removed, polled for up to 120 s.
leftover_filter="label=beyondleetcode.runner"
left=""
for _ in $(seq 1 24); do
  left="$(DOCKER_HOST="unix://$socket" docker ps -a --filter "$leftover_filter" --format '{{.Names}} {{.State}}' 2>&1)"
  [ -z "$left" ] && break
  sleep 5
done
if [ -n "$left" ]; then
  { echo "Left after 120 s:"; echo; echo '```'; echo "$left"; echo '```'; } >"$work/leftovers.md"
else
  echo "None left." >"$work/leftovers.md"
fi

write_summary

status=0
[ "$test_status" -eq 0 ] || status=1
[ -z "$left" ] || status=1
exit "$status"
