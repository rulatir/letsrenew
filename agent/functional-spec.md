This will be a dockerized LetsEncrypt renewal daemon.

Configuration defines renewal chores.

Each chore:

- has standard ID/name/description
- list of domains for the certificate (multiple `-d` will be used with certbot, or equivalent with LetsEncrypt SDK if available)
- SSH host alias (meaning most of the connection details will be in `~/.ssh/config`)
- path to the docroot, either absolute path on the target host or relative to SSH user $HOME

Operation:

- wakes up every 12h or so (configurable)
- for each chore:
  - checks certificate expiry date
  - if expiring within 10 days (configurable), initiates renewal
  - uses HTTP-01 `certonly --manual`-style challenge, deploys challenge response file via SSH to the target host's docroot/.well-known/acme-challenge/
  - upon successful renewal, removes challenge response file
  - logs actions and results
- also serves digest-authenticated status page over HTTP on a configurable port

Runtime:
 - bun
 - needs SSH in the container