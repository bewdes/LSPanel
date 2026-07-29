export function parseMetricBytes(value: string) {
  const match = value.trim().match(/^([\d.]+)\s*([kmgt]?i?b)?$/i)
  if (!match) return 0
  const units: Record<string, number> = {
    b: 1,
    kb: 1e3,
    mb: 1e6,
    gb: 1e9,
    tb: 1e12,
    kib: 1024,
    mib: 1024 ** 2,
    gib: 1024 ** 3,
    tib: 1024 ** 4,
  }
  return Number(match[1]) * (units[(match[2] || "b").toLowerCase()] || 1)
}

export function formatMetricBytes(value: number) {
  if (!value) return "0 B"
  const units = ["B", "KiB", "MiB", "GiB", "TiB"]
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`
}

export function sumIo(total: [number, number], value: string): [number, number] {
  const [input = "", output = ""] = value.split("/")
  return [total[0] + parseMetricBytes(input), total[1] + parseMetricBytes(output)]
}

export function serviceHostname(service: string, environmentName: string) {
  return `${service}.${environmentName.replaceAll("_", "-").toLowerCase()}.localhost`
}
