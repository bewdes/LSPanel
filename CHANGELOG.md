# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
(pre-1.0, so minor versions may still contain breaking changes).

## [Unreleased]

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
