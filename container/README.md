Container artifacts for LetsRenew

This directory contains files intended to be mounted into the running container image at conventional locations.

Conventions used by the daemon
- Configuration (YAML) expected at: /etc/letsrenew/config.yml (can be overridden with LETSRENEW_CONFIG)
- Certificate storage (volume) expected at: /data/certs
- SSH config should be mounted (if used) into the container at /root/.ssh/config (and any key files referenced by that config must also be mounted)

Files provided here
- etc/letsrenew/config.yml — example runtime configuration. Replace values and mount into container as /etc/letsrenew/config.yml.

Mounting examples (docker-compose)
- Mount config and cert storage:

  volumes:
    - ./container/etc/letsrenew/config.yml:/etc/letsrenew/config.yml:ro
    - letsrenew-certs:/data/certs
    - ./host-ssh-config:/root/.ssh/config:ro

- Ensure any private key files referenced by your ssh config are also mounted under the same paths or use an ssh-agent socket.

Security note
- Do not store private keys inside the image. Mount them at runtime and protect them with correct host filesystem permissions.

