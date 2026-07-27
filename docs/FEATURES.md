# Features

> 🇺🇦 Українська версія: [FEATURES.uk.md](FEATURES.uk.md)

A closer look at each area of LS Panel and the backend modules/commands behind it. For the overall system design, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Sites

Create, browse, and manage local projects.

- Create a new site from scratch, **import** an existing local directory, or **clone** a Git repository, via a project creation wizard with stack-specific templates (currently Laravel and WordPress get automated provisioning — Composer install and `.env` wiring for Laravel, download/database/install for WordPress — alongside a generic path for any other project type).
- Duplicate or delete a site, with a `DirectoryBaseline` capture so a failed provisioning step can be rolled back instead of leaving a half-set-up project.
- Repair site file permissions when ownership drifts (common after container-root writes).
- Backed by: `site_commands.rs`, `sites.rs`, `project_templates.rs`.

## Containers

Manage the Docker/Podman stack backing a site.

- Auto-detects `docker` or `podman` on the system (or a configured preference), and the matching Compose provider (`docker compose` or `podman-compose`).
- Start/stop/restart services, inspect a running environment's topology and resource usage, and stream container logs live.
- Long-running actions are tracked through the operation center so the UI reflects real progress instead of a blocking spinner.
- Backed by: `container_lifecycle.rs`, `container_inspection.rs`, `container_logs.rs`, `container_routes.rs`, `container_runtime.rs`, `container_validation.rs`, `containers.rs`, `runtime_commands.rs`.

## Databases

Per-project database management, independent of LS Panel's own SQLite metadata store.

- View connection credentials for use in external DB clients or application config.
- Create, clone, rename, clear, or delete additional databases inside an environment.
- Import/export a database from/to a file, and run ad-hoc queries.
- Backed by: `database_commands.rs`.

## Backups

The single place for two kinds of local, file-based safety nets:

- **Database backups** — on-demand SQL dumps, stored locally under LS Panel's application data and restorable back into the project's database.
- **Project snapshots** — a point-in-time capture of a project's database, `.env`, and environment configuration (not the Git-managed source tree, which Git already versions). Snapshots support export/import to a portable `.lspanel-snapshot` directory, and retention pruning (keep the newest _N_, delete the rest).
- Restoring a snapshot first takes a fresh safety snapshot, then restores environment config, `.env`, and the database, and rebuilds containers.
- Backed by: `backups.rs`, `database_commands.rs` (database backup commands), `snapshot_commands.rs`, `snapshots.rs`.

## Files

A file manager scoped to what LS Panel manages: site source files, container configuration, and local backups.

- Browse, read, write, rename, create directories, delete, and search project files.
- Inspect disk usage per folder and set file permissions.
- List/read managed (non-project) files that LS Panel itself owns.
- Backed by: `file_manager.rs`, `file_manager_commands.rs`.

## Environment files

Per-project `.env` / environment configuration management, separate from the ad-hoc file manager because it understands structure (profiles, secrets):

- Read/write a site's `.env` and its `.env.example`.
- Generate secure random secrets for env values.
- Save named environment **profiles** and switch (activate) between them, or delete a profile.
- Import/export environment configuration.
- Backed by: `environment_commands.rs`, `environment_files.rs`.

## Logs

Live, streaming logs for both whole projects and individual containers, using a subscription model (`LogStreams` app state) rather than one-shot fetches, so the UI updates as new lines arrive.

- Backed by: `logs.rs`, plus `start_environment_log_stream` / `stop_environment_log_stream` in `administration_commands.rs`.

## Mail

Captures and displays local development email instead of letting projects send real mail, by integrating with a local [Mailpit](https://github.com/axllent/mailpit) instance.

- List, read, delete, mark as read/unread ("check"), and release (actually send) captured messages.
- Backed by: `mailpit.rs`, `mailpit_commands.rs`.

## Certificates

A local certificate authority so development sites can use trusted HTTPS instead of self-signed-warning HTTP.

- Install/trust the LS Panel local CA once per machine.
- Issue, reissue, or delete HTTPS certificates for specific local domains, and reset the CA entirely if needed.
- Backed by: `tls.rs`, `certificate_commands.rs`.

## LiveLink

Exposes a running local site through a temporary, shareable public link — useful for showing work-in-progress to a client or teammate without deploying anywhere.

- Start/stop a LiveLink for a site and check its current status.
- Backed by: `livelink.rs`, `livelink_commands.rs`.

## System health & diagnostics

- **System Health** — surfaces overall system/container-runtime status, disk usage, and lets you prune build cache or dangling images.
- **Diagnostics** — runs targeted checks against a specific environment and explains what's wrong when a project won't start.
- Backed by: `diagnostics.rs`, `diagnose.rs`, `disk_usage.rs`, and several `administration_commands.rs` commands (`system_health`, `disk_usage`, `prune_build_cache`, `prune_dangling_images`, `project_health`).

## Integrated terminal

A real terminal, not a command runner — backed by `portable-pty` on the Rust side and `xterm.js` in the UI.

- Open a PTY session against a container, type interactively, resize, and close it.
- Save frequently used commands per site ("quick commands") and keep/clear a command history.
- Backed by: `terminal.rs`, `terminal_commands.rs`, `quick_commands.rs`.

## Settings

Panel-wide preferences, not tied to any one project:

- Interface language (English/Ukrainian) and confirmation behavior for destructive actions.
- System preferences: project storage location, preferred container runtime.
- Appearance: theme, sidebar behavior, motion/animation.
- Defaults applied to newly created projects, including whether to auto-initialize a Git repository.
- Backed by: `settings.rs`, `settings_commands.rs`.

## Operation center

Not a page of its own so much as a cross-cutting concern: any action that takes real time (provisioning, container start/stop, snapshot restore, ...) becomes a tracked `Operation` with progress and stage text, shown consistently across the UI, and safely recovered if LS Panel was closed or crashed mid-operation. See [ARCHITECTURE.md](ARCHITECTURE.md#operation-center) for the implementation details.
