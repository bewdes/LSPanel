export type EnvironmentEntry = { key: string; value: string; secret: boolean }
export type EnvironmentFile = {
  path: string
  exists: boolean
  text: string
  entries: EnvironmentEntry[]
}
