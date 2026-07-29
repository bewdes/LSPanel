#!/usr/bin/env node
// Verifies that the version string is identical across the three places
// that independently declare it, so a release can't accidentally ship
// with a stale package.json/Cargo.toml/tauri.conf.json version.
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))

const packageJson = JSON.parse(readFileSync(`${root}/package.json`, "utf8"))
const tauriConf = JSON.parse(readFileSync(`${root}/src-tauri/tauri.conf.json`, "utf8"))
const cargoToml = readFileSync(`${root}/src-tauri/Cargo.toml`, "utf8")
const cargoMatch = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)

const versions = {
  "package.json": packageJson.version,
  "src-tauri/tauri.conf.json": tauriConf.version,
  "src-tauri/Cargo.toml": cargoMatch?.[1],
}

const unique = new Set(Object.values(versions))
if (unique.size !== 1 || unique.has(undefined)) {
  console.error("Version mismatch across manifests:")
  for (const [file, version] of Object.entries(versions)) {
    console.error(`  ${file}: ${version ?? "(not found)"}`)
  }
  process.exit(1)
}

console.log(`Versions in sync: ${[...unique][0]}`)
