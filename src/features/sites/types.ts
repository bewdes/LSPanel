export type GitStatus = {
  repository: boolean
  branch: string
  dirty: boolean
  changedFiles: number
}
export type GitDetails = {
  branches: string[]
  commits: Array<{ hash: string; subject: string; author: string; relativeDate: string }>
  changes: Array<{ status: string; path: string }>
  remoteUrl?: string
}
export type HealthReport = {
  status: string
  checkedAt: number
  checks: Array<{
    code: string
    title: string
    status: string
    summary: string
    impact: string
    suggestions: string[]
  }>
}
