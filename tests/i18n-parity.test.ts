import assert from "node:assert/strict"
import test from "node:test"
import { readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

const i18nDir = fileURLToPath(new URL("../src/i18n", import.meta.url))
const files = readdirSync(i18nDir)
  .filter((name) => name.endsWith(".ts") && name !== "index.ts")
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

for (const file of files) {
  test(`i18n dictionary ${file} has matching en/uk keys`, async () => {
    const module = (await import(`../src/i18n/${file}`)) as Record<string, unknown>
    const dictionaries = Object.values(module)
    assert.equal(dictionaries.length, 1, `${file} should export exactly one dictionary`)
    const dictionary = dictionaries[0] as { en?: unknown; uk?: unknown }
    assert.ok(dictionary.en, `${file} is missing an "en" dictionary`)
    assert.ok(dictionary.uk, `${file} is missing a "uk" dictionary`)

    const enKeys = new Set<string>()
    const ukKeys = new Set<string>()
    collectKeyPaths(dictionary.en, "", enKeys)
    collectKeyPaths(dictionary.uk, "", ukKeys)

    const missingInUk = [...enKeys].filter((key) => !ukKeys.has(key))
    const missingInEn = [...ukKeys].filter((key) => !enKeys.has(key))

    assert.deepEqual(missingInUk, [], `${file}: keys present in en but missing in uk`)
    assert.deepEqual(missingInEn, [], `${file}: keys present in uk but missing in en`)
  })
}
