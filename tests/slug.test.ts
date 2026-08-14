import assert from "node:assert/strict"
import test from "node:test"

import { transliterateCyrillic } from "../src/lib/slug.ts"

test("transliterates Ukrainian Cyrillic into an ASCII-safe slug", () => {
  assert.equal(transliterateCyrillic("Мій проєкт"), "Mii proiekt")
  assert.equal(transliterateCyrillic("щастя"), "shchastia")
  assert.equal(transliterateCyrillic("гроші"), "hroshi")
})

test("leaves already-ASCII input untouched", () => {
  assert.equal(transliterateCyrillic("my-project_2"), "my-project_2")
})

test("passes through characters it doesn't recognize instead of dropping them", () => {
  assert.equal(transliterateCyrillic("プロジェクト"), "プロジェクト")
})
