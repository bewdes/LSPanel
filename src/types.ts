export type Environment = {
  id: string
  name: string
  phpVersion: string
  webServer: string
  webVersion: string
  database: string
  databaseVersion: string
  port: string
  webContainerName: string
  databaseContainerName: string
  phpExtensions: string[]
  extraServices: string[]
  databaseName: string
  databaseUser: string
  databasePassword: string
  databaseRootPassword: string
  phpMemoryLimit: string
  phpUploadLimit: string
  phpPostLimit: string
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
  environmentVariables: Record<string, string>
  restartPolicy: string
  cpuLimit: string
  containerMemoryLimit: string
  wordpressSiteTitle: string
  wordpressAdminUser: string
  wordpressAdminPassword: string
  wordpressAdminEmail: string
  nodeVersion: string
  nodePackageManager: string
  nodeCommand: string
  nodeRunMode: string
  nodeAutoInstall: boolean
  nodeAutoRestart: boolean
  nodeDevCommand: string
  nodeBuildCommand: string
  nodeStartCommand: string
  nodeInspector: boolean
  nodeInspectorPort: number
  redisVersion: string
  redisPassword: string
  redisMemoryLimit: string
  redisEvictionPolicy: string
  elasticsearchVersion: string
  elasticsearchMemoryLimit: string
  minioVersion: string
  minioRootUser: string
  minioRootPassword: string
  rabbitmqVersion: string
  rabbitmqUser: string
  rabbitmqPassword: string
  composerVersion: string
  backupScheduleEnabled: boolean
  backupScheduleIntervalHours: number
  backupRetentionCount: number
  runtimeMode: "container" | "native"
}

export type Site = {
  id: string
  name: string
  domain: string
  environmentId: string
  directory: string
  projectType?: string
  pinned?: boolean
  archived?: boolean
  enabled?: boolean
  group?: string
  tags?: string[]
  aliases?: string[]
  createdAt?: number
  lastStartedAt?: number
}

export type Runtime = {
  runtime?: string
  installed: boolean
  running: boolean
  composeAvailable: boolean
  message: string
  version?: string
}
