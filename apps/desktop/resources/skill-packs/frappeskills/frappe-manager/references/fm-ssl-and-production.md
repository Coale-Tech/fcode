# FM Production & SSL

Part of [frappe-manager.md](frappe-manager.md). Site creation flags are in
[fm-sites-and-installation.md](fm-sites-and-installation.md).

SSL is not a `fm create` flag — it is always a separate step with
`fm ssl add` after the bench exists. There is no `fm ssl <bench>
status|renew|disable|enable` subcommand; the real subcommands are `add`,
`remove`, `renew`, `list`, `acme-sh`, and `dns-config`.

## Production setup

```bash
fm create example.com --apps erpnext --environment prod
fm ssl add example.com example.com --dry-run   # validate against LE staging first
fm ssl add example.com example.com
```

`fm ssl add BENCHNAME DOMAIN` takes the bench name and the domain as two
separate positional arguments (they are often, but need not be, the same
string).

## Let's Encrypt

### HTTP-01 challenge (default)

For servers reachable on port 80 with the domain already pointing at the
host:

```bash
fm ssl add example.com example.com --dry-run
fm ssl add example.com example.com
```

### DNS-01 challenge (Cloudflare)

For servers behind a firewall, without port 80 open, or for wildcard
certificates. Save Cloudflare credentials once (globally, or per bench),
then issue:

```bash
fm ssl dns-config cloudflare --api-token YOUR_CLOUDFLARE_API_TOKEN
fm ssl add example.com example.com --challenge dns01 --dry-run
fm ssl add example.com example.com --challenge dns01
```

Pass `--wait-for-dns` to have FM poll for TXT-record propagation (every 30s,
up to 5 minutes) instead of failing immediately if it hasn't propagated yet.

### Wildcard certificates

DNS-01 is the only challenge type that supports wildcards. Issue the
wildcard alongside the apex domain, since most browsers require both:

```bash
fm ssl add mybench example.com --challenge dns01
fm ssl add mybench '*.example.com' --challenge dns01
```

## Custom / self-signed certificates

There is no documented `fm ssl <bench> custom` subcommand for importing an
existing certificate — the confirmed `fm ssl` subcommands are `add`
(Let's Encrypt via acme.sh only), `remove`, `renew`, `list`, `acme-sh`, and
`dns-config`. For a self-signed cert in local development, generate it and
wire it into your own reverse proxy in front of FM (or a manual Nginx SSL
config, below) rather than through `fm ssl`:

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout selfsigned.key -out selfsigned.crt \
  -subj "/CN=example.localhost"
```

## SSL management

```bash
fm ssl list <bench>                       # certs for one bench
fm ssl list --standalone                  # external (non-bench) certs
fm ssl list --all                         # bench + external
fm ssl renew <bench>                      # renew all certs for a bench
fm ssl renew <bench> <domain>             # renew one domain
fm ssl renew <bench> <domain> --force     # force, even if not yet due
fm ssl renew --all                        # renew across every bench
fm ssl remove <bench> <domain>
fm ssl remove <bench> <domain> --yes      # skip confirmation
```

Certificates are valid 90 days; FM renews automatically once fewer than 30
days remain. Automate it with cron:

```bash
crontab -e
# 0 3 * * * fm ssl renew --all
```

## Manual Nginx SSL config

For a hand-rolled reverse proxy in front of FM:

```nginx
server {
    listen 443 ssl http2;
    server_name example.com;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    add_header Strict-Transport-Security "max-age=63072000" always;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name example.com;
    return 301 https://$host$request_uri;
}
```

This template only applies when you are running your own proxy in front of
FM's stack; FM's own `global-nginx-proxy` already terminates TLS for
`fm ssl add`-managed domains and does not need this config.

## Operation notes

- Benches are named like `example.localhost`, accessible at `http://example.localhost`, by default
- For custom domains without DNS, add entries to `/etc/hosts`
- Run FM as a non-root user
- `fm ssl add` installs `acme.sh` on first use into
  `~/frappe/services/nginx-proxy/ssl/acmesh/.acme.sh/`; issued certificates
  live under `~/frappe/services/nginx-proxy/ssl/acmesh/<domain>/`
- Switching a bench to `--environment prod` disables developer mode and the
  Mailpit/Adminer admin tools by default (both are independently
  toggleable with `fm update <bench> --developer-mode`/`--admin-tools`)

## Troubleshooting

```bash
# Confirm domain DNS
dig +short example.com

# Confirm port 80 is reachable (for HTTP-01)
curl -v http://example.com/.well-known/acme-challenge/test

# Look for FM/nginx containers being up
fm list

# Check certificate expiry directly
echo | openssl s_client -connect example.com:443 2>/dev/null | openssl x509 -noout -dates
```

Mixed-content warnings usually mean the bench's alias/domain configuration
in `bench_config.toml` doesn't match the scheme users are hitting — check
`fm info <bench> --verbose` for the configured domains.

| Error | Cause | Fix |
|-------|-------|-----|
| `Too many certificates` / rate limit exceeded | Too many certificate requests for the same name set this week | Wait; use `--dry-run` (Let's Encrypt staging) while testing |
| `DNS record not found` (DNS-01) | TXT record not yet propagated | Wait 1–5 minutes, retry, or pass `--wait-for-dns` |
| `Connection refused` on port 80 (HTTP-01) | Firewall/security-group blocking port 80 | Open port 80, or use the DNS-01 challenge instead |
| `Authentication error` (DNS-01) | Cloudflare token lacks Zone → DNS → Edit | Recreate the token with that permission, re-save with `fm ssl dns-config cloudflare` |
| CAA record issue | DNS CAA restricts issuers | Add `CAA 0 issue "letsencrypt.org"` |

## Sources

Verified against the upstream `rtCamp/Frappe-Manager` repository (`main`
branch, matching the published "latest"/v0.19 docs) — `fm` is not
installed in this workspace, so upstream's auto-generated `--help` docs and
narrative SSL guide were used instead of local source or live `--help`
output:

- `docs/commands/ssl.md` — `fm ssl add/remove/renew/list/acme-sh` usage, arguments, and options (no `status`/`disable`/`enable`/`custom` subcommands exist)
- `docs/commands/ssl-dns-config-cloudflare.md` — `fm ssl dns-config cloudflare` credential setup
- `docs/guides/ssl.md` — end-to-end HTTP-01/DNS-01 workflow, wildcard requirement (DNS-01 only), acme.sh file locations, renewal cadence (90-day certs, renew at <30 days), error reference table
- `docs/guides/environments.md` — `prod` disables developer mode and admin tools by default; both are independently toggleable via `fm update`
- `frappe_manager/templates/docker-compose.services.tmpl` — confirms the shared `global-nginx-proxy` (not a per-bench proxy) terminates TLS
