# Features

> 🇺🇦 Українська версія: [FEATURES.uk.md](FEATURES.uk.md)

A closer look at each area of LS Panel and the backend modules/commands behind it. For the overall system design, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Sites

Create, browse, and manage local projects.

- Create a new site from scratch, **import** an existing local directory, or **clone** a Git repository, via a project creation wizard with stack-specific templates: Laravel, WordPress, and Symfony get automated provisioning (Composer install and `.env`/config wiring), Node/React projects get a dedicated single-process service instead of the usual web+PHP container pair, and anything else falls back to a generic path.
- Duplicate or delete a site, with a `DirectoryBaseline` capture so a failed provisioning step can be rolled back instead of leaving a half-set-up project.
- Repair site file permissions when ownership drifts (common after container-root writes).
- Backed by: `site_commands.rs`, `sites.rs`, `project_templates.rs`.

## Git

Per-site Git status and source control, without leaving LS Panel.

- Initialize a repository for a site that doesn't have one yet, or open its remote in the browser.
- View status (branch, ahead/behind counts, dirty working tree) and recent branch details.
- Fetch, pull (fast-forward only), push, and commit.
- Switch branches with a safety net: if uncommitted changes would be overwritten, LS Panel offers to stash them before switching or discard them and switch anyway, instead of just failing.
- An opt-in background monitor periodically fetches each site's repository and notifies you when the local branch falls behind its origin by more than a configurable number of commits (see [Background monitors](#background-monitors)).
- Backed by: `git.rs`, `git_commands.rs`, `git_status_monitor.rs`.

## Containers

Manage the Docker/Podman stack backing a site.

- Auto-detects `docker` or `podman` on the system (or a configured preference), and the matching Compose provider (`docker compose` or `podman-compose`).
- Start/stop/restart services, inspect a running environment's topology and resource usage, and stream container logs live.
- Connect projects through the shared `lspanel` network, with stable service addresses such as `web.demo.localhost`, `database.demo.localhost`, and `redis.demo.localhost`.
- Optional extra services per environment, each with its own version, credentials, and limits: Redis, Elasticsearch, MinIO, RabbitMQ.
- Auto-heal restarts a service that crashes or reports unhealthy, and auto-stop shuts down containers that sit idle past a configurable threshold — both optional, both configured in Settings.
- View the generated configuration behind an environment (compose.yaml, Dockerfile.php, nginx/Apache vhost, php-overrides.ini, and related files) read-only, without needing to find them on disk.
- Visiting a known site whose environment is stopped shows a "Project stopped" page naming the project, instead of the same generic "domain not found" page shown for an unrecognized domain.
- Long-running actions are tracked through the operation center so the UI reflects real progress instead of a blocking spinner.
- Backed by: `container_lifecycle.rs`, `container_inspection.rs`, `container_logs.rs`, `container_routes.rs`, `container_runtime.rs`, `container_validation.rs`, `container_schema.rs`, `container_compose.rs`, `container_bootstrap.rs`, `container_gateway.rs`, `containers.rs`, `runtime_commands.rs`, `auto_heal_monitor.rs`, `auto_stop_monitor.rs`.

## Databases

Per-project database management, independent of LS Panel's own SQLite metadata store.

- View connection credentials for use in external DB clients or application config.
- Create, clone, rename, clear, or delete additional databases inside an environment.
- Import/export a database from/to a file, and run ad-hoc queries.
- Import or export specific tables instead of the whole database: reads the tables present in a `.sql` file (via the standard `mysqldump`/`pg_dump` per-table comment markers) or lists a database's own tables, and lets you pick which ones.
- Database actions disable themselves with an explanatory note whenever the environment's database isn't reachable, instead of failing after the fact.
- Backed by: `database_commands.rs`, `backups.rs`.

## Backups

The single place for two kinds of local, file-based safety nets:

- **Database backups** — on-demand or scheduled SQL dumps (per-environment interval + retention count), stored locally under LS Panel's application data and restorable back into the project's database.
- **Project snapshots** — a point-in-time capture of a project's database, `.env`, and environment configuration (not the Git-managed source tree, which Git already versions). Snapshots support export/import to a portable `.lspanel-snapshot` directory, and retention pruning (keep the newest _N_, delete the rest).
- Restoring a snapshot first takes a fresh safety snapshot, then restores environment config, `.env`, and the database, and rebuilds containers.
- **Project export/import** — package a whole site (source, database, environment config) into a portable bundle you can move to another machine, distinct from the in-place snapshot restore above.
- Backed by: `backups.rs`, `backup_scheduler.rs`, `database_commands.rs` (database backup commands), `snapshot_commands.rs`, `snapshots.rs`, `project_export.rs`, `project_export_commands.rs`.

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
- The inbox list refreshes automatically in the background, and the SpamAssassin/HTML-compatibility checks for a message you've already opened aren't re-run every time you reopen it in the same session.
- Backed by: `mailpit.rs`, `mailpit_commands.rs`.

## Certificates

A local certificate authority so development sites can use trusted HTTPS instead of self-signed-warning HTTP.

- Install/trust the LS Panel local CA once per machine.
- Issue, reissue, or delete HTTPS certificates for specific local domains, and reset the CA entirely if needed.
- Backed by: `tls.rs`, `certificate_commands.rs`.

## LiveLink

Exposes a running local site through a temporary, shareable public link — useful for showing work-in-progress to a client or teammate without deploying anywhere.

- Start/stop a LiveLink for a site and check its current status.
- Choice of tunnel provider: Tailscale Serve/Funnel (default), ngrok, or Cloudflare Tunnel — install/auth state, setup, and notes are shown per selected provider, with the same confirm-then-progress install dialog used during onboarding.
- ngrok: authtoken managed in-app; optional reserved custom domain (requires a paid ngrok plan).
- Cloudflare Tunnel: browser-based login with the auth URL surfaced in-app (in case the browser doesn't open on its own), a base-domain field that auto-derives each site's hostname, and a one-click authorization reset for switching to a different Cloudflare zone.
- Starting a LiveLink is disabled with an explanation while the selected site's environment isn't running, instead of failing after the fact.
- Backed by: `livelink.rs`, `livelink_commands.rs`, `tunnel_provider.rs`.

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
- System preferences: project storage location, preferred container runtime, Docker BuildKit toggle.
- Preferred terminal and browser (used everywhere LS Panel opens a terminal or a local site/tool link), each with a custom-command option.
- Appearance: theme, sidebar behavior, motion/animation.
- How often the dashboard and sites list refresh their resource-usage stats.
- Defaults applied to newly created projects, including whether to auto-initialize a Git repository.
- Backed by: `settings.rs`, `settings_commands.rs`, `desktop_commands.rs`.

## Notifications

A persistent, in-app notification bell alongside OS-level toast notifications — every tracked action across sites, containers, databases, the file manager, certificates, LiveLink, and settings records a notification you can revisit later.

- View, mark as read, delete individually, or clear all notifications.
- Search both the notification history and the operation center's history to filter a long list down to what you're looking for.
- Optionally forward every notification to a Slack- or Discord-compatible webhook URL, restricted to public hosts, configured once in Settings.
- Backed by: `notifications.rs`, `webhook.rs`, plus the corresponding commands in `administration_commands.rs`.

## Background monitors

Opt-in checks that run continuously in the background and notify you instead of requiring you to go look:

- **Auto-heal** — restarts a container that crashes or reports unhealthy.
- **Auto-stop** — stops environments that sit idle (near-zero CPU) past a configurable duration, to save resources.
- **Git status** — periodically fetches each site's repository and warns when the local branch falls behind its origin by more than a configurable number of commits.
- **TLS/CA expiry** — warns before the local certificate authority or an issued certificate expires.
- **Disk space** — warns when free space under the configured sites directory drops below a configurable threshold.
- All are opt-in and configured in Settings; each is backed by its own module: `auto_heal_monitor.rs`, `auto_stop_monitor.rs`, `git_status_monitor.rs`, `tls_expiry_monitor.rs`, `disk_space_monitor.rs`.

## Operation center

Not a page of its own so much as a cross-cutting concern: any action that takes real time (provisioning, container start/stop, snapshot restore, ...) becomes a tracked `Operation` with progress and stage text, shown consistently across the UI, and safely recovered if LS Panel was closed or crashed mid-operation. See [ARCHITECTURE.md](ARCHITECTURE.md#operation-center) for the implementation details.
