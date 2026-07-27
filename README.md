# LS Panel

**LS Panel** is a desktop local development environment manager for PHP/web projects — a self-hosted alternative to tools like Local by Flywheel or Laravel Herd. It runs as a native app (Tauri + React) and drives Docker/Podman containers, local databases, TLS certificates, mail capture, backups, and more through a single UI.

> 🇺🇦 Українська версія цього документа: [README.uk.md](README.uk.md)

[![CI](https://github.com/bewdes/LSPanel/actions/workflows/ci.yml/badge.svg)](https://github.com/bewdes/LSPanel/actions/workflows/ci.yml)

## Features

- **Sites** — create, manage, and browse local development sites/projects, including a project creation wizard with templates.
- **Containers** — start/stop/inspect Docker or Podman containers and compose stacks (auto-detects `docker` or `podman`, with `docker-compose` / `podman-compose` support).
- **Databases** — manage per-project databases: connection credentials, cloning, renaming, clearing, import/export.
- **Database backups** — create and restore local SQL dumps, stored in the app's local data directory.
- **Project snapshots** — point-in-time snapshots of a project's database, `.env`, and environment configuration (source code managed by Git is not duplicated), with retention/pruning and export/import.
- **File manager** — browse site files, container configs, and local backups from within the panel.
- **Live logs** — stream live logs for projects and individual containers.
- **Mail capture** — view local development emails intercepted by [Mailpit](https://github.com/axllent/mailpit).
- **Certificates** — manage a local certificate authority and issue trusted HTTPS certificates for local domains.
- **Environment files** — edit and manage `.env` / environment configuration per project.
- **LiveLink** — expose a local site through a temporary public/shareable link.
- **System health & diagnostics** — inspect disk usage, runtime status, and diagnose common environment problems.
- **Settings** — panel, system, and appearance preferences, including project defaults and Git initialization for new projects.
- **Integrated terminal** — a PTY-backed terminal (via `portable-pty`) for running commands directly against a project or container.

The UI is fully bilingual (English / Ukrainian) via a lightweight built-in i18n layer (`src/i18n`).

## Tech stack

| Layer              | Technology                                                                              |
| ------------------ | --------------------------------------------------------------------------------------- |
| Desktop shell      | [Tauri 2](https://tauri.app/)                                                           |
| Backend            | Rust (`src-tauri/`), SQLite via `rusqlite`                                              |
| Frontend           | React 19, TypeScript, Vite 6                                                            |
| Styling / UI       | Tailwind CSS 4, shadcn-style components (`src/components/ui`), Radix/Base UI primitives |
| Data & tables      | `@tanstack/react-table`, `recharts` for charts                                          |
| Terminal           | `xterm.js` + `portable-pty` (Rust)                                                      |
| Container runtimes | Docker / Podman (+ Compose)                                                             |

## Project structure

```
lspanel/
├── src/                     # React frontend
│   ├── app/                 # App shell / dashboard
│   ├── components/ui/       # Shared UI primitives
│   ├── features/            # Feature modules (sites, containers, database, files, logs,
│   │                         #   mail, backups, certificates, snapshots, settings, livelink, ...)
│   ├── i18n/                # English/Ukrainian text dictionaries per feature
│   ├── hooks/, lib/         # Shared hooks and utilities
├── src-tauri/                # Rust/Tauri backend
│   └── src/                  # Tauri commands: containers, sites, databases, backups,
│                              #   snapshots, environment files, git, certificates, mail,
│                              #   terminal, diagnostics, settings, storage, ...
├── tests/                    # Frontend tests (Node's built-in test runner)
├── scripts/                  # Dev/CI helper scripts (env cleanup, container integration tests)
└── .github/workflows/        # CI: frontend checks, Rust checks/tests, Linux bundle build
```

## Getting started

### Prerequisites

- Node.js 22+
- Rust (stable) toolchain
- Docker or Podman (+ Compose) for container-backed features
- Linux build dependencies for Tauri (Debian/Ubuntu example):
  ```bash
  sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
  ```

### Install dependencies

```bash
npm install
```

### Run in development

```bash
npm run tauri     # launches the Tauri dev app (frontend + Rust backend)
# or, frontend only:
npm run dev
```

### Build

```bash
npm run build          # type-check + Vite build (frontend)
npm run tauri build    # full desktop app bundle
```

## Quality checks

```bash
npm run check           # runs check:frontend + check:rust
npm run check:frontend  # prettier, eslint, frontend tests, tsc, vite build
npm run check:rust      # cargo fmt --check, clippy (-D warnings), cargo test
npm run test:containers # container/compose integration tests (scripts/test-container-integration.sh)
```

Individual commands are also available: `npm run format`, `npm run format:check`, `npm run lint`, `npm run test:frontend`.

CI (`.github/workflows/ci.yml`) runs these same checks on every push/PR and additionally builds Linux `.deb`/`.rpm`/`.AppImage` bundles.

## Contributing

Issues and pull requests are welcome. Before opening a PR, please run `npm run check` locally so your change passes the same gates CI enforces.

## License

No license has been declared for this repository yet. All rights reserved by the author unless a license file is added.
