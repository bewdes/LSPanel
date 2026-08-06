import assert from "node:assert/strict"
import test from "node:test"
import { readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

const localesDir = fileURLToPath(new URL("../src/i18n/locales", import.meta.url))
const files = readdirSync(localesDir)
  .filter((name) => name.endsWith(".ts") && name !== "en.ts")
  .sort()

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

function collectKeyPaths(value: unknown, prefix: string, into: Set<string>) {
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      collectKeyPaths(child, prefix ? `${prefix}.${key}` : key, into)
    }
  } else {
    into.add(prefix)
  }
}

const en = (await import("../src/i18n/locales/en.ts")).default
const enKeys = new Set<string>()
collectKeyPaths(en, "", enKeys)

for (const file of files) {
  test(`i18n locale ${file} has the same keys as en.ts`, async () => {
    const locale = (await import(`../src/i18n/locales/${file}`)).default as unknown

    const localeKeys = new Set<string>()
    collectKeyPaths(locale, "", localeKeys)

    const missing = [...enKeys].filter((key) => !localeKeys.has(key))
    const extra = [...localeKeys].filter((key) => !enKeys.has(key))

    assert.deepEqual(missing, [], `${file}: keys present in en.ts but missing here`)
    assert.deepEqual(extra, [], `${file}: keys present here but missing in en.ts`)
  })
}
