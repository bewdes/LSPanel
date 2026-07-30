# Contributing to LS Panel

> 🇺🇦 Українська версія: [CONTRIBUTING.uk.md](CONTRIBUTING.uk.md)

Thanks for your interest in contributing! This project is a Tauri (Rust + React/TypeScript) desktop application.

## Development setup

```bash
npm install
npm run tauri   # dev app (frontend + Rust backend)
```

See [README.md](README.md) for prerequisites (Node.js 22+, Rust stable, Docker/Podman, Tauri Linux build dependencies).

## Before opening a pull request

Run the full check suite locally — CI enforces the same gates:

```bash
npm run check           # frontend + rust checks
npm run check:frontend  # prettier, eslint, frontend tests, tsc, vite build
npm run check:rust      # cargo fmt --check, clippy -D warnings, cargo test
```

For changes touching container/compose behavior, also run:

```bash
npm run test:containers
```

To see which frontend files are exercised by the test suite:

```bash
npm run test:frontend:coverage
```

## Guidelines

- Keep pull requests focused on a single change; avoid unrelated refactors.
- Match existing code style — `npm run format` (Prettier) and `cargo fmt` are authoritative for formatting, don't hand-format around them.
- Add or update frontend tests in `tests/` and Rust tests alongside the modules in `src-tauri/src/` for behavior changes.
- UI text lives in `src/i18n/*.ts` as paired `en`/`uk` dictionaries — add both when introducing new user-facing strings.
- Describe user-visible changes clearly in the PR description; link any related issue.
