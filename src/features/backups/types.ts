export type DatabaseBackup = {
  id: string
  environmentId: string
  database: string
  size: number
  createdAt: number
  path: string
}
