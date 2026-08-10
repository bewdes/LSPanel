export type Inspection = {
  status: string
  provisioned: boolean
  runningServices: number
  services: Array<{
    name: string
    containerName: string
    state: string
    health: string
    cpu: string
    memory: string
    networkIo: string
    blockIo: string
  }>
  logs: string
}
export type Runtime = { running: boolean; composeAvailable: boolean; message: string }
export type OperationProgress = {
  id: string
  progress: number
  stage: string
  indeterminate: boolean
}
