# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
(pre-1.0, so minor versions may still contain breaking changes).

## [Unreleased]

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

[0.1.0]: https://github.com/bewdes/LSPanel/releases/tag/v0.1.0
