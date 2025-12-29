Host setup for running LetsRenew in a container

This document explains how to prepare the host filesystem and SSH artifacts before launching the container using the provided `container/docker-compose.yml` example. The compose file uses direct host path bind-mounts so paths on the host are explicit.

Prerequisites on host
- Docker Engine and Docker Compose (or a docker-compose compatible tool)
- Bun and build toolchain if you plan to build the image locally inside the compose context (the compose file above references a Dockerfile in the repository root)

Directories to create and permissions

1) Certificate storage directory (explicit host path)

Choose a host path to store certificates. The example uses `./data/certs` (relative to the repository). For production you should prefer an absolute path, e.g. `/var/lib/letsrenew/certs`.

Example (recommended):

```bash
# create the directory (absolute path recommended)
mkdir -p /var/lib/letsrenew/certs
# set owner to the user who will manage the files (or root if running container as root)
chown $(id -u):$(id -g) /var/lib/letsrenew/certs
# set directory mode to 700 to restrict access
chmod 700 /var/lib/letsrenew/certs
```

If you use the repository-local path from the docker-compose example:

```bash
mkdir -p ./data/certs
chown $(whoami) ./data/certs
chmod 700 ./data/certs
```

2) Configuration file

The daemon expects `/etc/letsrenew/config.yml` inside the container by default. The compose example mounts `./container/etc/letsrenew/config.yml` from the repo into that path.

If you want to use a host-managed config file, place it at `/etc/letsrenew/config.yml` on the host, or set the environment variable `LETSRENEW_CONFIG` in the compose file to point to your host config path.

3) SSH configuration and keys

The importer and deployment handlers rely on the system `ssh` binary and a usable SSH config. The compose example mounts `./host-ssh-config` into `/root/.ssh` in the container; you must populate this directory with your SSH config and any referenced private keys.

Example layout (on host `./host-ssh-config`):

```
./host-ssh-config/
  config         # SSH config with Host aliases
  id_rsa         # private key (if referenced by config)
  id_rsa.pub
  known_hosts
```

Permissions: SSH demands strict permissions on private keys.

```bash
chmod 700 ./host-ssh-config
chmod 600 ./host-ssh-config/id_rsa
chmod 644 ./host-ssh-config/config
```

If you prefer agent forwarding instead of mounting private keys into the container, mount your agent socket and ensure the container user uses it (requires additional compose/evironment configuration).

Running the container (example)

From the `container/` directory run:

```bash
# build and start the container
docker compose up --build -d

# view logs:
docker compose logs -f letsrenew
```

Notes
- Ensure the container image provides an SSH client (openssh-client) and Bun runtime. If building locally from the repo, update the Dockerfile accordingly.
- Do not embed private keys in the image; always mount them at runtime and restrict host filesystem permissions.

Troubleshooting
- If importer SSH reads fail with authentication errors, try connecting from the host with the same ssh command and host alias to confirm keys/config are correct:

```bash
ssh -oBatchMode=yes myhomehost true
```

- If the container cannot read the config file at `/etc/letsrenew/config.yml`, verify the compose mount and file path are correct.

