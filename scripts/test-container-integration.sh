#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

unset LD_LIBRARY_PATH LD_PRELOAD DOCKER_HOST CONTAINER_HOST
cargo test --manifest-path "$ROOT_DIR/src-tauri/Cargo.toml"

if [[ "${LSPANEL_DOCKER_SMOKE:-0}" == "1" ]]; then
  cargo test --manifest-path "$ROOT_DIR/src-tauri/Cargo.toml" docker_smoke_starts_generated_stack -- --ignored --nocapture
else
  echo "Live Docker smoke test skipped. Run with LSPANEL_DOCKER_SMOKE=1 to enable it."
fi
