# Let'sRenew — Implementation Specification

Assumptions
- Runtime: Bun (TypeScript is preferred for typing and clarity).
- Container will provide an SSH client (OpenSSH) and allow mounting `~/.ssh/config` from the host into the container. The application itself does not manage private key files; any key files referenced by the mounted SSH config must be provided by the runner (e.g., mounted in the compose setup).
- ACME interactions: prefer a Node ACME library (e.g., `acme-client`) for a pure-JS integration and better testability; `certbot` shelling-out is a fallback option.
- Config lives on the container filesystem as YAML and can be overridden via environment variables / CLI.
- Repo layout follows a small TypeScript service structure with `src/`, `test/`, `Dockerfile`, and `agent/` docs.

Summary
This document is the implementation specification for a dockerized Let's Encrypt renewal daemon named "letsrenew". The daemon periodically evaluates configured "chores" (targets), deploys HTTP-01 challenge tokens to remote docroots over SSH, renews certificates using an ACME client, removes challenge tokens on success, and exposes a digest-authenticated status page. The specification defines data models, components, sequence flows, configuration, Docker/runtime notes, security guidance, error/retry strategies, tests, and deliverables.

Checklist
- [ ] Create `agent/impl-spec.md` (this file)
- [ ] Project skeleton: `src/`, `test/`, `config.example.yml`, `README.md`
- [ ] Implement `ConfigLoader` and schema validation
- [ ] Create data models: `Chore`, `CertificateRecord`, `Config`, etc.
- [ ] Implement `Storage` with atomic writes
- [ ] Implement `SSHDeployer` (uses system `ssh` and relies on mounted `~/.ssh/config`)
- [ ] Implement `ACMEClientAdapter` (library-based preferred)
- [ ] Implement `RenewalManager` and `Scheduler`
- [ ] Implement `StatusServer` (digest auth)
- [ ] Add unit and integration tests, smoke scripts
- [ ] Add Dockerfile and runtime notes

Goals and Non-Goals

Goals
- Manage multiple chores describing remote hosts and docroots for HTTP-01 challenge deployment.
- Periodically check certificate expiry and automatically renew when near expiry.
- Deploy challenge files via SSH, verify ACME challenge, and remove challenge files on success.
- Expose a digest-authenticated HTTP status page listing chores and last-run results.
- Run in a Bun-based container with SSH tooling available and support mounting `~/.ssh/config` and cert storage volumes.
- Provide robust retry/backoff and idempotent operations.

Non-Goals
- Supporting DNS-01 challenges or complex multi-step deploy workflows other than writing files to docroot.
- Providing a full UI beyond the HTTP status endpoint and structured logs.
- Managing remote processes beyond file operations via SSH.

Requirements Mapping (from `agent/functional-spec.md`)
- Dockerized renewal daemon
- Config defines renewal chores
- Chore fields: id, name, description, domains[], docroot
- Scheduler every ~12h (configurable)
- Check expiry and renew if within threshold (default 10 days)
- HTTP-01 challenge using SSH to write token file in `.well-known/acme-challenge/`
- Remove challenge file on success
- Logs actions and results
- Digest-authenticated status page
- Runtime Bun and SSH in container

High-Level Architecture

Components
- ConfigLoader (`src/components/config-loader.ts`) — reads YAML config, applies env/CLI overrides, and validates config shape and handler-specific params when schemas are available.
- Scheduler (`src/components/scheduler.ts`) — periodic orchestrator that triggers checks and supports on-demand runs.
- RenewalManager (`src/components/renewal-manager.ts`) — per-chore coordinator: decide renewal and orchestrate ACME + deployment steps.
- ACMEClientAdapter (`src/components/acme-client-adapter.ts`) — abstracts ACME interactions; supports a library adapter (e.g., `acme-client`) and a fallback shell-out adapter.
- Deployment Handlers (registry under `src/deploy/`) — pluggable implementations that place and remove challenge artefacts on targets. A handler registry maps handler identifiers to factories and optional runtime validation schemas.
- SSH-alias handler (`deploy/ssh-alias.ts`) — built-in handler that places files using the system `ssh` command and a host alias defined in a mounted SSH config.
- Storage (`src/components/storage.ts`) — atomic writes and file management for keys and certificates, enforcing restrictive permissions for private keys.
- StatusServer (`src/components/status-server.ts`) — digest-authenticated HTTP endpoints for monitoring and health.
- Logger (`src/components/logger.ts`) — structured logging configuration and output.
- CLI Entrypoint (`src/cli.ts`) — process bootstrap and lightweight admin commands (run once, test handler connectivity).

Design principles
- Clear separation between data-only specification objects (for example `Chore`) and operational logic classes (for example `RenewalManager`).
- Pluggable deployment handlers identified by a `type` string and a free-form `params` object; handlers validate their own params at runtime or via registered JSON Schemas.
- Fail-safe behavior for independent chores: errors are logged and isolated so other chores continue executing.
- Idempotent operations where possible (deploying the same token multiple times is safe; storage uses atomic rename semantics).

Data Model Definitions

All models live under `src/models/`.

Chore
- id: string
- name: string
- description?: string
- domains: DomainSpec[] (one certificate covering multiple domain names)
- docroot: string (default docroot; handlers may override per-domain)
- certPath?: string (optional explicit path for stored certificate files)
- enabled: boolean
- notifyOnFailure?: string[]
- preferredAcmeAccount?: string
- challengeType?: string (ACME challenge type for this chore, default 'http-01')

DomainSpec
- name: string (FQDN)
- deployment?: DeploymentDescriptor (optional per-domain override for how to place the challenge response)

DeploymentDescriptor
- type: string — deployment handler identifier (open set). Example identifiers: `ssh-alias`, `local-http-file`, `sftp`, `rsync`.
- params?: Record<string, unknown> — handler-specific parameters interpreted and validated by the handler.

Example `ssh-alias` params (conventional)
- sshHostAlias: string — host alias defined in a mounted `~/.ssh/config`.
- docroot?: string — override remote docroot.
- targetPath?: string — relative path under docroot (default `.well-known/acme-challenge`).
- fileNameTemplate?: string — naming convention for challenge files, default is token.
- permissions?: string — mode for files created on the remote host (e.g., `0644`).

Type and Validation Strategy
- The central TypeScript type for deployment descriptors is intentionally permissive:

  interface DeploymentDescriptor {
    type: string;
    params?: Record<string, unknown>;
  }

- Strict validation is achieved via an extensible registry: handler registrations may include a JSON Schema or zod schema used by `ConfigLoader` to validate `params` at load time. Handlers must still validate parameters defensively at runtime.

Operational Sequence (Check-and-Renew)

1. Scheduler triggers `RenewalManager.checkAndRenew(chore)`.
2. Load stored CertificateRecord for the chore.
3. If certificate is valid and not within expiry threshold, skip renewal.
4. ACMEClientAdapter.createOrder(domains) to obtain an order.
5. Acquire ACME challenge (HTTP-01 token and keyAuthorization).
6. Resolve deployment handler for each domain (domain-level `deployment` or chore-level default) and invoke handler.deploy(...) to place the challenge artifact.
7. ACMEClientAdapter.notifyChallengeReady(order, challenge).
8. ACMEClientAdapter.waitForChallengeValid(order, challenge) with polling and timeout.
9. ACMEClientAdapter.finalizeOrder and retrieve the certificate chain.
10. Storage.writeCertificateFiles atomically and update the CertificateRecord metadata.
11. Invoke handler.cleanup(...) to remove challenge artifacts.
12. Record success/failure and emit structured logs and status updates.

Failure Handling
- SSH and other deployment errors: treat network and transient errors as retryable (exponential backoff and a bounded retry count). Treat permission and configuration errors as non-retryable for the current run.
- ACME validation failures: attempt redeploy once; if still failing, report failure and leave cleanup to handler cleanup or operator action.
- Storage failures: attempt retries; if persistent, log and surface the error; do not expose private keys in logs.
- Cleanup failures: log at warning level and continue; provide operator-visible status for manual remediation.

Security and Operational Notes
- SSH authentication: the application relies on the operator to provide a mounted `~/.ssh/config` and any referenced key files or agent sockets. The application does not manage or provision private keys. If `~/.ssh/config` contains plaintext passwords, normal SSH client behavior applies; the operator bears responsibility for secret management.
- File permissions: private keys written by the service must be stored with owner-only permissions (600) and written atomically.
- Status auth: digest authentication using a precomputed HA1 value is the preferred configuration format to avoid storing plaintext passwords.
- Do not log private key material or certificate private data.

Configuration
- Primary configuration is YAML. Representative fields:
  - version
  - intervalMinutes
  - expiryThresholdDays
  - statusPort
  - statusDigestUser
  - statusDigestPasswordHash (HA1)
  - certStorageDir
  - acme: { directoryUrl, clientMode }
  - deployment handler defaults and per-chore / per-domain `deployment` descriptors

Container and Deployment
- Image must include Bun runtime and an OpenSSH client. The operator must mount `certStorageDir` and any SSH configuration and key files referenced by that config.
- Do not bake private keys into container images; provide them via secure mounts or agent forwarding.

Testing and Validation
- Unit tests for: config parsing and overrides, handler param validation, RenewalManager logic with mocked ACME and deploy handlers.
- Integration tests for: end-to-end ACME flow against a staging CA (or a local ACME test server), handler connectivity (SSH alias), and storage correctness.

YAML Example

```yaml
version: 1
intervalMinutes: 720
expiryThresholdDays: 10
statusPort: 8080
statusDigestUser: "status"
statusDigestPasswordHash: "md5hex-of-user:realm:password"
certStorageDir: "/data/certs"
acme:
  directoryUrl: "https://acme-v02.api.letsencrypt.org/directory"
  clientMode: "library"
ssh:
  knownHostsPath: "/root/.ssh/known_hosts"
logging:
  level: "info"
  json: false
chores:
  - id: "site-example"
    name: "example.com cert"
    description: "Main certificate for example.com"
    challengeType: "http-01"
    domains:
      - name: "example.com"
      - name: "www.example.com"
        deployment:
          type: "ssh-alias"
          params:
            sshHostAlias: "web.example.com"
            docroot: "/var/www/other-site"
    deployment:
      type: "ssh-alias"
      params:
        sshHostAlias: "web.example.com"
    docroot: "/var/www/html"
    enabled: true
```

Definitions reference
- Chore: unit of work representing the renewal lifecycle for one certificate (may cover multiple domains).
- DeploymentDescriptor: identifies a deployment handler and its parameters. The handler is responsible for placing and removing challenge artifacts; the `type` field is an identifier resolved by a runtime registry.

Appendix: Handler Registry (conceptual)
- Registry entry shape: { id: string, validateSchema?: JSONSchema, factory: (params)=>Handler }
- Built-in entries: `ssh-alias` with a schema for `sshHostAlias` and docroot; `local-http-file` for local filesystem deployment.
