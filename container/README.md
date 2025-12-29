Container artifacts for LetsRenew

This directory is the host -> container runtime interface for LetsRenew.

Purpose
- Files and directories under `container/` are intended to be mounted into the running container at the same relative paths. Only place files here that MUST be visible inside the container at runtime.
- Do not place build-time or developer-only artifacts here.

What belongs in `container/`
- `container/etc/letsrenew/config.example.yml` — configuration template (the operator provides the runtime `config.yml` on the host and mounts it into `/etc/letsrenew/config.yml`).
- `container/home/letsrenew/...` — example home tree (SSH config examples, known_hosts templates). Operators may copy or mount a host directory over this path for the running container's `$HOME`.
- `container/data/letsrenew/.dir` (or another sentinel) if you need to commit an otherwise-empty directory for cert storage layout reference.

What MUST NOT be committed into `container/`
- Runtime secrets and private keys (private SSH keys, account private keys, certificate private keys). Those must be kept on the host and mounted at runtime by the operator.

Runtime mount points used by the daemon (conventional)
- `/etc/letsrenew` — configuration directory (daemon reads `/etc/letsrenew/config.yml` by default; override with LETSRENEW_CONFIG)
- `/home/letsrenew` — container runtime home (the compose setup mounts `container/home/letsrenew` here by default; `$HOME` is set to this path)
- `/home/letsrenew/.ssh` — SSH config and keys used by deployment handlers (mount host SSH config/keys into this path)
- `/data/letsrenew` — certificate storage (persistent writable volume where `chores/<chore-id>` directories live)

Recommended repository layout under `container/` (examples)
- container/etc/letsrenew/config.example.yml
- container/home/letsrenew/.ssh/config.example  (template only)
- container/data/letsrenew/.dir  (sentinel so empty layout is present in git)

Operator quickstart (use these repo-local defaults or map to absolute host paths)
1. Prepare host directories and copy runtime config (do NOT commit runtime config):

```bash
mkdir -p ./data/letsrenew
mkdir -p ./container/etc/letsrenew
mkdir -p ./host-ssh-config
cp container/etc/letsrenew/config.example.yml ./container/etc/letsrenew/config.yml
# edit ./container/etc/letsrenew/config.yml with runtime values (do not commit)
```

2. Secure SSH mount and cert storage (important):

```bash
chown -R $(id -u):$(id -g) ./data/letsrenew ./host-ssh-config ./container/etc/letsrenew
chmod 700 ./data/letsrenew ./host-ssh-config
chmod 600 ./host-ssh-config/id_rsa || true
```

3. Start the stack (run the container process as the current user so mounts and permissions line up):

```bash
LOCAL_UID=$(id -u) LOCAL_GID=$(id -g) docker compose up --build -d
```

Compose mount example (repo defaults)
- mounts used by the provided `docker-compose.yml`:
  - `./data/letsrenew:/data/letsrenew:rw`
  - `./container/etc/letsrenew:/etc/letsrenew:ro`
  - `./host-ssh-config:/home/letsrenew/.ssh:ro`
  - `./container/home/letsrenew:/home/letsrenew:ro`

Security and operational notes
- The operator is responsible for providing any private keys referenced in SSH config; do not commit those keys into git.
- Use strict filesystem permissions: `.ssh` 700, private keys 600, cert storage directory 700.
- Prefer mounting `/etc/letsrenew` read-only into the container; cert storage must be writable by the runtime UID.

Maintainership guidance (internal)
- `container/` is the host-facing runtime surface. Before adding files under `container/`, ask whether the file must be present inside the running container. If not, put documentation or build artifacts elsewhere (project root or `agent/`).
- `config.example.yml` is the config schema reference and may remain in the repo; runtime `config.yml` must be supplied by the operator.

This document is the authoritative runtime interface spec for `container/` — keep it up to date when you change mount conventions or runtime paths.
