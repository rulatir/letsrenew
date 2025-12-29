# LetsRenew
========

A Bun-based daemon to renew Let's Encrypt certificates using HTTP-01 challenges deployed to remote hosts.

## Quickstart

- Install deps: `bun install`
- Run (recommended, runs container as current user to avoid root):

```bash
# prepare host dirs if needed
mkdir -p ./data/letsrenew
mkdir -p ./container/etc/letsrenew
mkdir -p ./host-ssh-config
# ensure permissions
chown -R $(id -u):$(id -g) ./data/letsrenew ./container/etc/letsrenew ./host-ssh-config
chmod 700 ./data/letsrenew ./host-ssh-config

# run compose with LOCAL_UID/GID set to your user so container runs non-root
LOCAL_UID=$(id -u) LOCAL_GID=$(id -g) docker compose up --build -d

# follow logs
docker compose logs -f letsrenew
```

The compose setup uses `LOCAL_UID`/`LOCAL_GID` to run the service process as the invoking user by default (avoids needing an entrypoint that chowns mounts).

See `container/README.md` for mount conventions and runtime notes.

## Certificate storage (current implementation)

LetsRenew stores certificates and metadata under the configured `certStorageDir` (see `config.example.yml` for `certStorageDir`). The storage layout for a chore with id `<chore-id>` is:

- <certStorageDir>/chores/<chore-id>/
  - privkey.pem      (private key, mode 600)
  - cert.pem         (leaf certificate, mode 644)
  - chain.pem        (chain only, mode 644) — optional
  - fullchain.pem    (leaf + chain, mode 644) — optional
  - meta.json        (metadata JSON)

The repository includes `src/components/storage.ts` which provides `writeCertificateFiles` and `readCertificateFiles` helpers. Keys are written atomically and private keys are written with owner-only permissions (600).

## Importing from certbot (/etc/letsencrypt)

If you currently manage certificates with certbot (which stores live certificates under `/etc/letsencrypt/live/<domain>/`), use the bundled importer script to copy PEMs into letsrenew's storage layout.

Usage (run inside container or on host with Bun available):

```bash
# Local import from the same machine
bun src/tools/import-certbot.ts /etc/letsencrypt/live/example.com site-example /data/letsrenew

# Remote import over SSH (host alias must be resolvable and accessible from where you run this command):
bun src/tools/import-certbot.ts myhomehost:/etc/letsencrypt/live/example.com site-example /data/letsrenew

# If the chore defines importFrom in the runtime config (/etc/letsrenew/config.yml), you can omit the source:
bun src/tools/import-certbot.ts site-example /data/letsrenew
```

Arguments:
- source live-dir: path to certbot's `live/<domain>/` directory (must contain `privkey.pem` and `cert.pem`). Can be a remote spec of the form `host:/absolute/path` — in that case the importer will SSH to `host` and read files.
- chore-id: the target chore id used by letsrenew to reference the certificate.
- certStorageDir (optional): target base directory (defaults to `./data/letsrenew`).

What the importer does:
- Copies `privkey.pem`, `cert.pem`, `chain.pem` and/or `fullchain.pem` from the certbot `live` directory into the letsrenew storage layout.
- Writes a basic `meta.json` containing domains (if autodetected) and timestamps. You should verify or update `meta.json` after import to ensure domain lists and ACME account links are accurate.

SSH prerequisites for remote import
- The importer uses the system `ssh` client to read files and to run `openssl` on the remote host (if available). It invokes `ssh -oBatchMode=yes <host> ...` which requires passwordless authentication (public-key or agent) or the command will fail fast.
- Ensure the SSH host alias or hostname is reachable from the machine/container where you run the importer and that the necessary private key (or ssh-agent) is available. Mount or provide `~/.ssh/config` and key files inside the container if running the importer there.

Important notes about migration and safety:
- Do not run certbot and letsrenew concurrently against the same certificate files; choose one manager per certificate.
- After import, update your letsrenew configuration to include a chore with the same `chore-id` and appropriate `domains` and `deployment` settings.

## Next steps after import

- Verify the imported certificate metadata (`meta.json`) and update `chore` config as needed.
- Run letsrenew's renewal flow (once implemented) to ensure the daemon can manage renewals going forward.
