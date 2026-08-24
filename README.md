# LS Panel

<p align="center">
  <img src="docs/assets/poster.png" alt="LS Panel — desktop local development environment manager for PHP/web projects" width="800">
</p>

**LS Panel** is a desktop local development environment manager for PHP/web projects. It runs as a native app (Tauri + React) and drives Docker/Podman containers, local databases, TLS certificates, mail capture, backups, and more through a single UI.

> 🇺🇦 Українська версія цього документа: [README.uk.md](README.uk.md)

[![CI](https://github.com/bewdes/LSPanel/actions/workflows/ci.yml/badge.svg)](https://github.com/bewdes/LSPanel/actions/workflows/ci.yml)
![Version](https://img.shields.io/badge/version-0.6.0--beta-orange)
![Rust](https://img.shields.io/badge/backend-Rust-b7410e)
![React](https://img.shields.io/badge/frontend-React_19-61dafb)
![Tauri](https://img.shields.io/badge/shell-Tauri_2-24c8db)
![Docker](https://img.shields.io/badge/runtime-Docker-2496ed)
![Podman](https://img.shields.io/badge/runtime-Podman-892ca0)
![Linux](https://img.shields.io/badge/platform-Linux-fcc624)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

> ⚠️ **Status: v0.6.0-beta.** LS Panel is in active early development — expect breaking changes and rough edges.

## Why LS Panel?

- Native Linux desktop application — no Electron, no browser tab to keep open.
- Docker and Podman support, auto-detected, with Compose for multi-service stacks.
- HTTPS out of the box via a local certificate authority — no self-signed warnings.
- Local-first: your data (SQLite metadata, backups, snapshots) stays on your machine.
- No cloud account, license server, or telemetry required to use it.
- Built for PHP and modern web development, with first-class Laravel, WordPress, and Symfony project provisioning, plus dedicated handling for Node/React projects.

## Features

**Development** — Sites · Git · Containers · Databases · Environment files · Live logs · Integrated terminal

**Productivity** — Mail capture (Mailpit) · Project snapshots · Database backups · LiveLink · Certificates

**System** — Diagnostics & system health · Settings · File manager

See [docs/FEATURES.md](docs/FEATURES.md) for what each one does and the backend modules behind it.

The UI is fully bilingual (English / Ukrainian) via a lightweight built-in i18n layer (`src/i18n`).

## Tech stack

| Layer              | Technology                                                                        |
| ------------------ | --------------------------------------------------------------------------------- |
| Desktop shell      | [Tauri 2](https://tauri.app/)                                                     |
| Backend            | Rust (`src-tauri/`), SQLite via `rusqlite`                                        |
| Frontend           | React 19, TypeScript 6, Vite 8                                                    |
| Styling / UI       | Tailwind CSS 4, shadcn-style components (`src/components/ui`), Base UI primitives |
| Data & tables      | `@tanstack/react-table`, `recharts` for charts                                    |
| Terminal           | `xterm.js` + `portable-pty` (Rust)                                                |
| Container runtimes | Docker / Podman (+ Compose)                                                       |

## Project structure

```
lspanel/
├── src/                     # React frontend
│   ├── main.tsx             # App shell, navigation, and top-level state
│   ├── components/          # Shared app components and UI primitives
│   ├── features/            # Feature modules (sites, containers, database, files, logs,
│   │                         #   mail, backups, certificates, snapshots, settings, livelink, ...)
│   ├── i18n/                # English/Ukrainian locale dictionaries
│   ├── hooks/, lib/         # Shared hooks and utilities
├── src-tauri/                # Rust/Tauri backend
│   └── src/                  # Tauri commands: containers, sites, databases, backups,
│                              #   snapshots, environment files, git, certificates, mail,
│                              #   terminal, diagnostics, settings, storage, ...
├── tests/                    # Frontend tests (Node's built-in test runner)
├── scripts/                  # Dev/CI helper scripts (env cleanup, container integration tests)
└── .github/workflows/        # CI: frontend checks, Rust checks/tests, Linux bundle build
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ([uk](docs/ARCHITECTURE.uk.md)) — how the frontend and Rust backend fit together, persistence, environments/runtimes, the operation center.
- [docs/FEATURES.md](docs/FEATURES.md) ([uk](docs/FEATURES.uk.md)) — a feature-by-feature tour of the app and the backend modules behind each one.
- [CONTRIBUTING.md](CONTRIBUTING.md) ([uk](CONTRIBUTING.uk.md)) — development setup and the checks a pull request needs to pass.
- [CHANGELOG.md](CHANGELOG.md) — notable changes per release.

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
npm run tauri dev # launches the Tauri dev app (frontend + Rust backend)
# or, frontend only:
npm run dev
```

> The `tauri` script wraps the Tauri CLI through `scripts/tauri-clean-env.sh` and forwards whatever subcommand you pass — running `npm run tauri` with no subcommand just prints the Tauri CLI's help text, it does not start the app.

#### Why a wrapper script?

If you launch `npm run tauri dev` from a terminal running inside a **snap-packaged editor** (e.g. VS Code installed via snap), that terminal inherits `SNAP_*`/`XDG_DATA_HOME` variables pointing at the editor's own sandboxed data directory. Docker/Podman then read/write their storage state through that redirected path instead of your real `~/.local/share/containers`, which can make container tooling report a storage/database mismatch after the editor updates to a new snap revision. `scripts/tauri-clean-env.sh` starts the Tauri process with a clean, explicit environment (`env -i` plus an allowlist of the variables GTK/WebKit/Cargo actually need) so this never happens, regardless of which terminal you launched it from.

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

CI (`.github/workflows/ci.yml`) runs the frontend and Rust checks on every push/PR and additionally builds Linux `.deb`/`.rpm`/`.AppImage` bundles. The live Docker smoke test is opt-in and is not part of the regular CI workflow.

## Contributing

Issues and pull requests are welcome. Before opening a PR, please run `npm run check` locally so your change passes the same gates CI enforces.

## License

Licensed under the [Apache License, Version 2.0](LICENSE).
