import type { Environment } from "@/types"

// Fields intentionally not collected by the wizard; the backend fills them via #[serde(default)].
export type WizardEnvironmentPayload = Omit<
  Environment,
  | "elasticsearchVersion"
  | "elasticsearchMemoryLimit"
  | "minioVersion"
  | "minioRootUser"
  | "minioRootPassword"
  | "rabbitmqVersion"
  | "rabbitmqUser"
  | "rabbitmqPassword"
  | "backupScheduleEnabled"
  | "backupScheduleIntervalHours"
  | "backupRetentionCount"
>

// Inputs to buildEnvironmentPayload, named after the wizard's own local state vars
// (not the WizardEnvironmentPayload field names — the function does that renaming/derivation).
export type WizardPayloadInput = {
  id: string
  name: string
  webServer: string
  webVersion: string
  phpVersion: string
  database: string
  databaseVersion: string
  nodePort: string
  phpExtensions: string[]
  isNative: boolean
  services: string[]
  nodeVersion: string
  databaseName: string
  databaseUser: string
  databasePassword: string
  databaseRootPassword: string
  phpMemoryLimit: string
  phpUploadLimit: string
  phpExecutionTime: number
  phpJit: boolean
  phpJitMode: string
  phpJitBufferSize: string
  phpCron: boolean
  phpCronSchedule: string
  phpCronCommand: string
  phpFpmProcessManager: string
  phpFpmMaxChildren: number
  phpFpmStartServers: number
  phpFpmMinSpareServers: number
  phpFpmMaxSpareServers: number
  phpFpmMaxRequests: number
  phpXdebug: boolean
  phpXdebugMode: string
  phpXdebugPort: number
  phpXdebugStart: string
  phpXdebugIdeKey: string
  appEnvironment: string
  databaseEncoding: string
  autoCreateDatabase: boolean
  sqlDump: string
  nodeInstallCommand: string
  nodePackageManager: string
  nodeAutoRestart: boolean
  nodeCommand: string
  nodeRunMode: string
  nodeDevCommand: string
  nodeBuildCommand: string
  nodeStartCommand: string
  nodeInspector: boolean
  nodeInspectorPort: number
  executionMode: "container" | "native"
  composerVersion: string
  wordpressSiteTitle: string
  wordpressAdminUser: string
  wordpressAdminPassword: string
  wordpressAdminEmail: string
}

export type OperationProgress = {
  environmentId?: string
  progress: number
  stage: string
}

export type Settings = {
  sitesDirectory: string
  defaultWebServer: string
  defaultPhpVersion: string
  defaultNodeVersion: string
  defaultDatabase: string
  defaultDatabaseVersion: string
  autoInitGit: boolean
  autoStartProjects: boolean
}
