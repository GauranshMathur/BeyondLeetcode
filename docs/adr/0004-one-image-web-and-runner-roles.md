# One image with web and runner roles, run by docker compose

We ship a single image, `ghcr.io/gauranshmathur/beyondleetcode`, whose command picks a role: `web`, `runner`, or `init` (writes `compose.yaml` and `.env` for the operator). `docker compose up` runs web and runner as separate containers, and only the runner mounts the container engine socket (see ADR 0002). One image keeps install and upgrades to one tag and one pull; separate containers keep the socket away from the process that faces the internet.
