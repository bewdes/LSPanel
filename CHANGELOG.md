# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
(pre-1.0, so minor versions may still contain breaking changes).

## [Unreleased]

### Added

- Backup retention control: keep the newest N database backups and clean up older local dumps with one click, matching the existing project-snapshot retention UI.
- The "SQL dump" field on project creation now actually imports the file into the new database instead of being silently ignored.

### Fixed

- `LS_PANEL_AUTO_CREATE_DATABASE` set to "false" was ignored — the database was always created on environment start regardless of the toggle. The selected database charset is now also applied when the database is created.
- Node environments with run mode "start" never ran their configured build command before starting, in both the containerized and native runtimes.
- The SQL console's automatic pre-query backup could be skipped for a destructive query: it only checked that the query *started* with a read-only keyword, so `SELECT 1; DROP TABLE users;` was piped to the database client with no safety-net backup taken first.
- Restoring a snapshot on a stopped environment skipped the automatic pre-restore database backup entirely (it only backed up the database if the environment happened to already be running), so a restore that failed partway through had no database to roll back to even though the rollback message claimed the previous state was restored.
- The local HTTPS certificate and its private key are written by two separate file renames; an interruption between them (or any other cause of the pair going out of sync) could leave a mismatched certificate/key pair that was silently trusted and reused, breaking every local HTTPS site with no obvious cause. The certificate is now verified against its key before being reused.
- A genuine UI double-click (or any two near-simultaneous requests) starting an operation on the same environment could lose the race between the "is one already running" check and the insert, surfacing a raw SQLite constraint error instead of the same friendly "already has an active operation" message.
- Auto-heal never actually fixed a service that was running but reporting unhealthy: it only acted when the restart policy was "no", and its action was `start`, which is a no-op on a container that's still running. A running-but-unhealthy service is now restarted regardless of restart policy, since Docker/Podman's restart policy only governs behavior after a container exits.
- Auto-stop's idle detection was CPU-only, so a PHP request paused at an Xdebug breakpoint (~0% CPU for as long as the developer is stepping through code, but with a live connection back to the IDE) looked identical to a genuinely idle stack and could be silently stopped mid-debugging-session. An established connection to the configured Xdebug port now counts as activity.
- The background Git status monitor's unattended `fetch --prune` and a user-initiated Git action (pull, push, commit, checkout) could run concurrently on the same repository with no coordination, occasionally surfacing a raw Git lock-file error with no clear explanation. Mutating Git operations on the same project now serialize against each other.
- The branch name shown right after "Initialize Git" on a brand-new project was the literal text "No commits yet on main" instead of "main" — a repository with no commits yet reports its branch in `git status` differently than one with history, and only the normal case was parsed.
- Project name uniqueness was checked case-sensitively, so creating "MyProject" when "myproject" already existed passed validation but silently aliased the same directory on case-insensitive filesystems (macOS, Windows, exFAT, some Linux setups). Project names also had no length limit, even though they become a DNS label (`{name}.localhost`) capped at 63 characters.

### Changed

- Rewrote the i18n system: translations now live in one file per language (`src/i18n/locales/en.ts`, `uk.ts`, ...) instead of scattered across ~25 per-feature files. Adding a language is now just adding one new locale file with the same keys as `en.ts` (TypeScript enforces the keys match at compile time). The LiveLink page's translations, previously inline `uk ? "..." : "..."` ternaries that bypassed the shared system entirely, are now part of it too. The two-language `uk`/`en` toggle threaded through the whole component tree as a boolean is now a plain locale-code string, since a boolean can't represent a third language.

### Removed

- Unused, unwired systemd service wrapper (`service.rs`) and demo data table component that were never reachable from the app.

## [0.3.1-beta] - 2026-08-06

### Fixed

- The local HTTPS gateway container could fail to recreate with "container name already in use" — the same restart race the port-conflict retry already handled, just under a different Docker error message.
- The local CA was never actually imported into Chrome's certificate trust store on a machine where Chrome hadn't been launched yet (`~/.pki/nssdb` didn't exist), so "Install/trust CA" silently reported success while sites still showed as insecure.
- The first-run setup wizard's Cloudflare Tunnel authentication step had the same silent-wait problem LiveLink's did: no indication a browser tab should open, and no fallback link if it didn't.

## [0.3.0-beta] - 2026-08-05

### Added

- LiveLink: per-provider status/setup card that shows only the selected tunnel provider's install and auth state, with explanatory notes for each (Tailscale operator access, ngrok free-plan domain limits, Cloudflare zone delegation).
- LiveLink: ngrok and Cloudflare Tunnel installs now use the same confirm-then-progress dependency install dialog as onboarding, instead of installing silently.
- LiveLink: optional reserved custom domain for ngrok tunnels (paid ngrok plans).
- LiveLink: Cloudflare Tunnel base-domain field that auto-derives each site's hostname from its name; a one-click "reset authorization" to switch Cloudflare zones without leaving the app.
- LiveLink: Cloudflare Tunnel login now streams the auth URL into the app as soon as it's available, instead of only showing success/failure once the whole flow completes.

### Fixed

- LiveLink: ngrok tunnels were killed and reported as failed even when they started successfully, because the public-URL match required a `127.0.0.1:<port>` address while ngrok reports `localhost:<port>`.
- LiveLink: Cloudflare Tunnel creation failed with a deserialization error on accounts with zero existing tunnels (`cloudflared tunnel list --output json` prints `null`, not `[]`).

## [0.2.0] - 2026-08-04

### Added

- Persistent in-app notification center, with per-notification delete, mark-as-read, and clear-all, covering site/container/database/file-manager/certificate/LiveLink/settings operations.
- Optional Slack/Discord-compatible webhook forwarding for notifications.
- Background monitors (all opt-in, configured in Settings): auto-heal for crashed/unhealthy containers, auto-stop for idle environments, Git-behind-origin checks, TLS/CA expiry reminders, and low-disk-space alerts.
- Scheduled, automatic database backups (interval + retention count per environment), alongside the existing on-demand backups.
- Project export/import: package a site (source, database, environment config) into a portable bundle and restore it as a new site.
- Extra per-environment services: Elasticsearch, MinIO, and RabbitMQ, alongside the existing Redis support.
- Symfony project provisioning, and dedicated single-process handling for Node/React projects.
- LiveLink tunnel provider choice: ngrok and Cloudflare Tunnel, alongside the default Tailscale Serve/Funnel.
- One-container-per-project enforcement in the project creation wizard (occupied environments are marked and rejected).
- Cross-distribution dependency installation during onboarding for Docker, Podman, Git/GitHub CLI/npm/NVM, OpenSSL, NSS tools, and Cloudflare Tunnel.
- Live installation progress with an explicit confirmation dialog showing every command before administrator authorization.
- Managed Cloudflare Tunnel setup: account authentication, named tunnel creation, local configuration, DNS routing, and hostname validation.

### Fixed

- Docker detection and socket-access recovery after installation.
- Onboarding disk-space detection for project directories that do not exist yet.
- Blurred modal, menu, select, sheet, drawer, and tooltip rendering in WebKitGTK.
- Nginx container health checks on images that do not include `wget`.

## [0.1.0] - 2026-07-28

Initial public beta.

### Added

- Site, container (Docker/Podman + Compose), and database management for local PHP/web projects.
- Database backups and project snapshots (database + `.env` + environment config), with retention pruning and export/import.
- Local certificate authority and per-domain HTTPS certificates.
- Mail capture via a local Mailpit integration.
- LiveLink: securely expose a local site through Tailscale Serve/Funnel.
- File manager, live log streaming, and an integrated PTY-backed terminal with saved quick commands.
- System health, disk usage, and per-project diagnostics.
- A guided first-run setup wizard (appearance, workspace directory, environment check, remote access) and a first-run home screen for creating or importing the first project.
- Bilingual UI and documentation (English / Ukrainian).
- Apache-2.0 license.

[Unreleased]: https://github.com/bewdes/LSPanel/compare/v0.3.1-beta...HEAD
[0.3.1-beta]: https://github.com/bewdes/LSPanel/releases/tag/v0.3.1-beta
[0.3.0-beta]: https://github.com/bewdes/LSPanel/releases/tag/v0.3.0-beta
[0.2.0]: https://github.com/bewdes/LSPanel/releases/tag/v0.2.0
[0.1.0]: https://github.com/bewdes/LSPanel/releases/tag/v0.1.0
