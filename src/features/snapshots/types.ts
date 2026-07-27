export type ProjectSnapshot = {
  id: string
  siteId: string
  name: string
  createdAt: number
  size: number
  hasDatabase: boolean
}

export type SnapshotComparison = {
  configurationChanges: string[]
  envAdded: string[]
  envRemoved: string[]
  envChanged: string[]
  snapshotDatabaseSize: number
}
