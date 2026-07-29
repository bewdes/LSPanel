export type Diagnosis = {
  healthy: boolean
  summary: string
  findings: Array<{ severity: string; title: string; explanation: string; action: string }>
}
