import assert from "node:assert/strict"
import test from "node:test"

import { formatMetricBytes, parseMetricBytes, serviceHostname, sumIo } from "../src/lib/format.ts"
import { errorMessage, isAppError } from "../src/lib/errors.ts"
import { defaultDatabaseVersion } from "../src/lib/version-catalog.ts"

test("container metrics support decimal and binary units", () => {
  assert.equal(parseMetricBytes("1 KB"), 1_000)
  assert.equal(parseMetricBytes("1.5 MiB"), 1.5 * 1024 ** 2)
  assert.equal(parseMetricBytes("invalid"), 0)
})

test("metric formatting stays readable at boundaries", () => {
  assert.equal(formatMetricBytes(0), "0 B")
  assert.equal(formatMetricBytes(1024), "1.0 KiB")
  assert.equal(formatMetricBytes(1.5 * 1024 ** 3), "1.5 GiB")
})

test("I/O totals combine both directions", () => {
  assert.deepEqual(sumIo([1024, 2048], "1 KiB / 2 KiB"), [2048, 4096])
})

test("unknown databases use the supported PostgreSQL default", () => {
  assert.equal(defaultDatabaseVersion("MariaDB"), "11.8")
  assert.equal(defaultDatabaseVersion("Unknown"), "17")
})

test("service hostnames normalize legacy environment names", () => {
  assert.equal(serviceHostname("mailpit", "My_Project"), "mailpit.my-project.localhost")
})

test("invoke errors support both legacy strings and structured application errors", () => {
  assert.equal(errorMessage("Runtime is unavailable"), "Runtime is unavailable")
  assert.equal(
    errorMessage({
      code: "runtime_unavailable",
      message: "Docker or Podman is required",
      recoverable: true,
    }),
    "Docker or Podman is required",
  )
  assert.equal(errorMessage(new Error("Connection failed")), "Connection failed")
  assert.equal(errorMessage(null), "Unknown error")
})

test("structured application errors require a stable code and message", () => {
  assert.equal(isAppError({ code: "invalid_input", message: "Invalid domain" }), true)
  assert.equal(isAppError({ message: "Invalid domain" }), false)
  assert.equal(isAppError("[object Object]"), false)
})
