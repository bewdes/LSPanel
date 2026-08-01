# Architecture

> 🇺🇦 Українська версія: [ARCHITECTURE.uk.md](ARCHITECTURE.uk.md)

LS Panel is a [Tauri 2](https://tauri.app/) desktop application: a React/TypeScript frontend rendered in a native webview, backed by a Rust process that does all filesystem, process, database, and container work. The two sides communicate exclusively through Tauri's `invoke()` command bridge and event emitters — the frontend never talks to Docker, SQLite, or the filesystem directly.

```
┌─────────────────────────────┐        invoke("command", args)        ┌───────────────────────────────┐
│   React frontend (src/)     │ ─────────────────────────────────────▶│   Rust backend (src-tauri/)   │
│  features/*, components/ui  │◀───────────────────────────────────── │   *_commands.rs + domain mods │
└─────────────────────────────┘        events (progress, logs, ...)   └───────────────────────────────┘
                                                                                  │
                                                                                  ▼
                                                                 SQLite (rusqlite) · Docker/Podman · PTY
```

## Frontend (`src/`)

- **`app/`** — application shell and dashboard composition.
- **`features/*`** — one folder per domain area (sites, containers, database, backups, snapshots, certificates, mail, environment-files, files, logs, livelink, settings). Each feature owns its page component(s) and any feature-local components.
- **`components/ui/`** — shared, shadcn-style UI primitives built on Tailwind CSS 4 and Radix/Base UI.
- **`i18n/`** — one file per feature, each exporting an `{ en, uk }` dictionary. `i18n/index.ts` exposes `pickLanguage(dict, uk)` to select the active language; there is no runtime translation loading, dictionaries are statically imported.
- **`hooks/`, `lib/`** — shared React hooks and utilities (formatting, error normalization, version catalog for project templates, etc.).

## Backend (`src-tauri/src/`)

The backend has no single "server" abstraction — it's a flat set of modules registered as Tauri commands. Each domain typically splits into:

- a **data/logic module** (e.g. `sites.rs`, `containers.rs`, `snapshots.rs`) with plain functions and (de)serializable structs, and
- a **`*_commands.rs`** module that wraps that logic in `#[tauri::command]`-annotated functions the frontend can `invoke()`.

`bootstrap.rs` is the composition root: it builds the `tauri::Builder`, registers shared in-memory state, runs startup setup, and lists every command in a single `tauri::generate_handler![...]` call (~130 commands as of this writing).

### Shared application state

Registered via `.manage(...)` in `bootstrap.rs` and injected into commands as `tauri::State`:

- `logs::LogStreams` — active live-log subscriptions for projects/containers.
- `terminal::TerminalSessions` — open PTY sessions (backed by `portable-pty`) for the integrated terminal.
- `native_runtime::NativeProcesses` — child processes / static file servers started for projects that run **without** a container (see below).
- `tunnel_provider::TunnelProcesses` — child processes backing an active LiveLink tunnel (ngrok/cloudflared).

### Persistence

All durable state lives in one SQLite database at the OS app-data directory (`<app_data_dir>/lspanel.sqlite3`), opened through `rusqlite` with WAL journaling. `storage.rs` owns the connection and a `PRAGMA user_version`-based migration system (`migrate_schema_v1`, `migrate_schema_v2`, ...) that re-runs every idempotent `CREATE TABLE IF NOT EXISTS` on every launch rather than gating on version equality, so a partially-applied build can't leave a table permanently missing; tables include `settings`, `environments`, `sites`, `operations`, and `notifications`, generally storing structured data as JSON columns for flexibility. There is no external database server — this SQLite file is LS Panel's own metadata store, separate from any per-project database engines (Postgres/MySQL/etc.) that a _managed project_ uses, which are handled by `database.rs`/`database_commands.rs` instead.

### Environments and runtimes

A **site** (a project LS Panel manages) runs inside an **environment**, which can be backed by one of two runtimes:

- **Container runtime** (`container_runtime.rs`, `container_lifecycle.rs`, `container_inspection.rs`, `container_logs.rs`, `container_routes.rs`, `container_validation.rs`) — auto-detects `docker` or `podman` on `PATH` (configurable), and drives Compose (`docker compose` or `podman-compose`) to bring stacks up/down, inspect services, and stream logs.
- **Native runtime** (`native_runtime.rs`) — for project types that don't need a container (e.g. a plain static site or a lightweight dev server), LS Panel instead spawns a child process directly or serves files with a built-in static server, tracked in `NativeProcesses`.

`project_templates.rs` provisions new sites for specific stacks (e.g. downloading and configuring WordPress, installing Laravel via Composer and wiring its `.env`) as well as generic import/clone/copy of existing projects, with a `DirectoryBaseline` capture/rollback mechanism so a failed provision can be undone.

### Operation center

Longer-running actions (provisioning, container operations, snapshot restore, etc.) are tracked as `Operation` rows (`operations.rs`): each has an id, optional `environment_id`, `kind`, `status`, `progress` (0–100), `stage` label, and timestamps, persisted in SQLite and pushed to the frontend as events via `tauri::Emitter`. Only one active operation per environment is allowed at a time. On startup, `operations::recover_interrupted` reconciles any operation left `running` from a previous session (e.g. after a crash) so the UI never shows a stale in-progress state.

### Security-sensitive file handling

`security.rs` centralizes filesystem writes for anything exported outside the app's own data directory (`.env` exports, snapshot exports, log exports): writes go to a temporary sibling file and are only renamed into place after success, existing symlinks at the destination are refused, and secret values can be redacted in logs/output.

### Other backend modules

- `tls.rs` / `certificate_commands.rs` — local certificate authority and per-domain HTTPS certificate issuance.
- `mailpit.rs` / `mailpit_commands.rs` — talks to a local [Mailpit](https://github.com/axllent/mailpit) instance to list/read/delete/release captured emails.
- `git.rs` / `git_commands.rs` — per-site Git status/actions (init, checkout, remote) for project source control.
- `diagnostics.rs` / `diagnose.rs` / `disk_usage.rs` — system/environment health checks and disk usage reporting surfaced in the System Health page.
- `terminal.rs` / `terminal_commands.rs` / `quick_commands.rs` — PTY-backed terminal sessions plus saved "quick commands" and command history per site.
- `settings.rs` / `settings_commands.rs` — panel-wide preferences (language, appearance, project defaults).
- `notifications.rs` / `webhook.rs` — the persistent in-app notification store and optional Slack/Discord-compatible webhook forwarding, used as the single call site whenever a user-facing event happens.
- `auto_heal_monitor.rs`, `auto_stop_monitor.rs`, `git_status_monitor.rs`, `tls_expiry_monitor.rs`, `disk_space_monitor.rs`, `backup_scheduler.rs` — opt-in background threads (`std::thread::spawn(move || loop { check(&app); sleep(interval) })`) started from `bootstrap.rs`, each polling one condition and calling into `notifications.rs` when it fires.
- `project_export.rs` / `project_export_commands.rs` — packages a site (source, database, environment config) into a portable bundle and re-imports one as a new site.

## Build & tooling

- **Frontend**: Vite 6 + TypeScript + React 19, Tailwind CSS 4. `npm run build` type-checks then builds; `npm run dev` runs the Vite dev server standalone.
- **Backend**: standard Cargo workspace at `src-tauri/`, built via `tauri-build`; `npm run tauri dev` / `npm run tauri build` drive the full desktop app through the Tauri CLI (the `tauri` npm script wraps the CLI in `scripts/tauri-clean-env.sh` and forwards the subcommand you pass — it requires an explicit `dev`/`build` argument).
- **CI** (`.github/workflows/ci.yml`) runs frontend checks (Prettier, ESLint, frontend tests, `tsc`, Vite build), Rust checks (`cargo fmt --check`, `cargo clippy -D warnings`, `cargo test`), and then builds Linux `.deb`/`.rpm`/`.AppImage` bundles.

See [FEATURES.md](FEATURES.md) for a feature-by-feature breakdown of what each part of the UI does and which backend commands power it.
