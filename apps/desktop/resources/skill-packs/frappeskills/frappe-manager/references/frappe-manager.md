# Frappe Manager (fm) — Reference Index

Frappe Manager (`fm`) is a third-party CLI by rtCamp that manages Docker-based
Frappe/ERPNext environments via Docker Compose, built on official
[Frappe Docker](https://github.com/frappe/frappe_docker) images. It is not an
official Frappe project. Procedure and when-to-use guidance:
[SKILL.md](../SKILL.md).

The full command surface is split by topic:

- [fm-sites-and-installation.md](fm-sites-and-installation.md) — install `fm`,
  `fm create` options, site management, services, config, exit codes
- [fm-dev-workflow.md](fm-dev-workflow.md) — shell access, `fmx`, the standard
  dev cycle, agent-driven development, testing, debugging, cleanup
- [fm-ssl-and-production.md](fm-ssl-and-production.md) — production setup,
  Let's Encrypt, custom certificates, Nginx SSL config, SSL troubleshooting
- [fm-docker-config.md](fm-docker-config.md) — FM's real generated
  Docker Compose architecture (shared `global-db`/`global-nginx-proxy`,
  per-bench Redis, `debugpy`-based debugging) plus generic Compose
  reference material for cases the `fm` CLI itself doesn't cover

Bench CLI commands run the same way inside an `fm shell` container as on a
native bench — always with `bench --site <site>.localhost ...` for
site-scoped commands (FM appends `.localhost` to the bench name to form the
site name):
[../../frappe-bench-operations/references/bench.md](../../frappe-bench-operations/references/bench.md).

`fm` is a fast-moving third-party tool. The command surface in this topic
was verified against the upstream `rtCamp/Frappe-Manager` repository (the
`main` branch, which matches the published "latest"/v0.19 docs) since `fm`
is not installed in this workspace — confirm flags with `fm <command>
--help` before relying on anything below that looks stale.

## Sources

- [rtCamp/Frappe-Manager](https://github.com/rtCamp/Frappe-Manager) — `README.md`, `docs/commands/index.md`
- [FM documentation](https://opensource.rtcamp.com/Frappe-Manager/dev/)
