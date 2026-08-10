import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { errorMessage } from "@/lib/errors"
import { listen } from "@tauri-apps/api/event"
import { open } from "@tauri-apps/plugin-dialog"
import {
  ArrowLeft,
  ArrowRight,
  Blocks,
  Check,
  Code2,
  Copy,
  Eye,
  EyeOff,
  FileCode2,
  Folder,
  GitFork,
  Globe2 as W,
  Server,
  Zap,
} from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { pickLanguage } from "@/i18n"
import {
  DATABASE_VERSIONS,
  PHP_EXTENSIONS,
  PHP_VERSIONS,
  WEB_SERVER_VERSIONS,
  defaultDatabaseVersion,
} from "@/lib/version-catalog"
import type { Environment, Runtime, Site } from "@/types"

// Fields intentionally not collected by the wizard; the backend fills them via #[serde(default)].
type WizardEnvironmentPayload = Omit<
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
type OperationProgress = {
  environmentId?: string
  progress: number
  stage: string
}
type Settings = {
  sitesDirectory: string
  defaultWebServer: string
  defaultPhpVersion: string
  defaultNodeVersion: string
  defaultDatabase: string
  defaultDatabaseVersion: string
  autoInitGit: boolean
  autoStartProjects: boolean
}
export function ProjectWizard({
  environments,
  sites,
  language,
  runtime,
  initialProjectType,
  onCancel,
  onCreated,
}: {
  environments: Environment[]
  sites: Site[]
  language: string
  runtime: Runtime | null
  initialProjectType?: string
  onCancel: () => void
  onCreated: (id: string) => void
}) {
  const text = pickLanguage(language).projectWizard
  const steps = text.steps
  const occupiedEnvironmentIds = new Set(sites.map((site) => site.environmentId))
  const availableEnvironments = environments.filter((item) => !occupiedEnvironmentIds.has(item.id))
  const [step, setStep] = React.useState(0)
  const [projectType, setProjectType] = React.useState(initialProjectType ?? "php")
  const [name, setName] = React.useState("")
  const [domain, setDomain] = React.useState("")
  const [environmentId, setEnvironmentId] = React.useState(
    availableEnvironments[0]?.id ?? environments[0]?.id ?? "",
  )
  const [environmentMode, setEnvironmentMode] = React.useState<"existing" | "new">(
    availableEnvironments.length ? "existing" : "new",
  )
  const [environmentName, setEnvironmentName] = React.useState("")
  const [webServer, setWebServer] = React.useState("Nginx")
  const [webVersion, setWebVersion] = React.useState(WEB_SERVER_VERSIONS.Nginx[0])
  const [phpVersion, setPhpVersion] = React.useState("8.4")
  const [database, setDatabase] = React.useState("MariaDB")
  const [databaseVersion, setDatabaseVersion] = React.useState("11.8")
  const [nodeVersion, setNodeVersion] = React.useState("22")
  const [phpExtensions, setPhpExtensions] = React.useState(["intl", "mbstring", "opcache", "zip"])
  const [composerVersion, setComposerVersion] = React.useState("2")
  const [phpMemoryLimit, setPhpMemoryLimit] = React.useState("256M")
  const [phpUploadLimit, setPhpUploadLimit] = React.useState("64M")
  const [phpExecutionTime, setPhpExecutionTime] = React.useState(120)
  const [phpJit, setPhpJit] = React.useState(false)
  const [phpJitMode, setPhpJitMode] = React.useState("tracing")
  const [phpJitBufferSize, setPhpJitBufferSize] = React.useState("64M")
  const [phpCron, setPhpCron] = React.useState(false)
  const [phpCronSchedule, setPhpCronSchedule] = React.useState("* * * * *")
  const [phpCronCommand, setPhpCronCommand] = React.useState("php artisan schedule:run")
  const [phpFpmProcessManager, setPhpFpmProcessManager] = React.useState("dynamic")
  const [phpFpmMaxChildren, setPhpFpmMaxChildren] = React.useState(10)
  const [phpFpmStartServers, setPhpFpmStartServers] = React.useState(2)
  const [phpFpmMinSpareServers, setPhpFpmMinSpareServers] = React.useState(1)
  const [phpFpmMaxSpareServers, setPhpFpmMaxSpareServers] = React.useState(3)
  const [phpFpmMaxRequests, setPhpFpmMaxRequests] = React.useState(500)
  const [phpXdebug, setPhpXdebug] = React.useState(false)
  const [phpXdebugMode, setPhpXdebugMode] = React.useState("develop,debug")
  const [phpXdebugPort, setPhpXdebugPort] = React.useState(9003)
  const [phpXdebugStart, setPhpXdebugStart] = React.useState("trigger")
  const [phpXdebugIdeKey, setPhpXdebugIdeKey] = React.useState("LSPANEL")
  const [nodePackageManager, setNodePackageManager] = React.useState("npm")
  const [nodeInstallCommand, setNodeInstallCommand] = React.useState("npm install")
  const [nodeCommand, setNodeCommand] = React.useState("npm run dev -- --host 0.0.0.0")
  const [nodeRunMode, setNodeRunMode] = React.useState("dev")
  const [nodeAutoRestart, setNodeAutoRestart] = React.useState(true)
  const [nodeDevCommand, setNodeDevCommand] = React.useState("npm run dev -- --host 0.0.0.0")
  const [nodeBuildCommand, setNodeBuildCommand] = React.useState("npm run build")
  const [nodeStartCommand, setNodeStartCommand] = React.useState("npm start")
  const [nodeInspector, setNodeInspector] = React.useState(false)
  const [nodeInspectorPort, setNodeInspectorPort] = React.useState(9229)
  const [nodePort, setNodePort] = React.useState("3000")
  const [executionMode, setExecutionMode] = React.useState<"container" | "native">("container")
  const [runtimeMode, setRuntimeMode] = React.useState("development")
  const [databaseName, setDatabaseName] = React.useState("app")
  const [databaseUser, setDatabaseUser] = React.useState("app")
  const [databaseEncoding, setDatabaseEncoding] = React.useState("utf8mb4")
  const [autoCreateDatabase, setAutoCreateDatabase] = React.useState(true)
  const [sqlDump, setSqlDump] = React.useState("")
  const [wordpressSiteTitle, setWordpressSiteTitle] = React.useState("")
  const [wordpressAdminUser, setWordpressAdminUser] = React.useState("admin")
  const [wordpressAdminPassword, setWordpressAdminPassword] = React.useState("")
  const [showWordpressAdminPassword, setShowWordpressAdminPassword] = React.useState(false)
  const [wordpressPasswordCopied, setWordpressPasswordCopied] = React.useState(false)
  const [wordpressAdminEmail, setWordpressAdminEmail] = React.useState("")
  const [services, setServices] = React.useState<string[]>(["mailpit", "adminer"])
  const [settings, setSettings] = React.useState<Settings | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [createdProjectId, setCreatedProjectId] = React.useState("")
  const [creationProgress, setCreationProgress] = React.useState({
    progress: 0,
    stage: text.preparingProject,
  })
  const [creationElapsed, setCreationElapsed] = React.useState(0)
  const activeCreationEnvironment = React.useRef("")
  const creationStartedAt = React.useRef(0)
  const [error, setError] = React.useState("")
  const [sourceDirectory, setSourceDirectory] = React.useState("")
  const [repositoryUrl, setRepositoryUrl] = React.useState("")
  const [autoInitGit, setAutoInitGit] = React.useState(true)
  const defaultsApplied = React.useRef(false)
  React.useEffect(() => {
    void invoke<Settings | null>("load_settings").then((value) => {
      setSettings(value)
      if (value && !defaultsApplied.current) {
        defaultsApplied.current = true
        setWebServer(value.defaultWebServer)
        setWebVersion(WEB_SERVER_VERSIONS[value.defaultWebServer]?.[0] ?? "2.4")
        setPhpVersion(value.defaultPhpVersion)
        setNodeVersion(value.defaultNodeVersion)
        setDatabase(value.defaultDatabase)
        setDatabaseVersion(value.defaultDatabaseVersion)
        setAutoInitGit(value.autoInitGit)
      }
    })
  }, [])
  React.useEffect(() => {
    if (!busy) return
    const updateElapsed = () =>
      setCreationElapsed(Math.max(0, Math.floor((Date.now() - creationStartedAt.current) / 1000)))
    updateElapsed()
    const timer = window.setInterval(updateElapsed, 1000)
    return () => window.clearInterval(timer)
  }, [busy])
  React.useEffect(() => {
    const unlisten = listen<OperationProgress>("operation-progress", ({ payload }) => {
      if (payload.environmentId !== activeCreationEnvironment.current) return
      setCreationProgress({
        progress: Math.max(0, Math.min(100, payload.progress)),
        stage: payload.stage || text.buildingProject,
      })
    })
    return () => {
      void unlisten.then((dispose) => dispose())
    }
  }, [text.buildingProject])
  React.useEffect(() => {
    if (!environmentId && availableEnvironments[0]) setEnvironmentId(availableEnvironments[0].id)
  }, [environmentId, availableEnvironments])
  React.useEffect(() => {
    if (database === "PostgreSQL")
      setServices((current) => current.filter((item) => item !== "phpmyadmin"))
  }, [database])
  React.useEffect(() => {
    if (["node", "react"].includes(projectType) && environmentMode !== "new")
      setEnvironmentMode("new")
  }, [projectType, environmentMode])
  const environment = environments.find((item) => item.id === environmentId)
  const appEnvironment =
    projectType === "symfony" ? (runtimeMode === "production" ? "prod" : "dev") : runtimeMode
  const isNodeProject = projectType === "node" || projectType === "react"
  const nameValid = /^[A-Za-z0-9_-]+$/.test(name)
  const domainValid = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+localhost$/.test(domain)
  const conflict = sites.find((site) => site.domain === domain || site.name === name)
  const environmentNameValid = /^[A-Za-z0-9_-]+$/.test(environmentName)
  const environmentConflict = environments.some((item) => item.name === environmentName)
  const canContinue =
    step === 0 ||
    (step === 1 &&
      nameValid &&
      domainValid &&
      !conflict &&
      (projectType !== "wordpress" ||
        (Boolean(wordpressSiteTitle.trim()) &&
          /^[A-Za-z0-9_-]+$/.test(wordpressAdminUser) &&
          wordpressAdminPassword.length >= 8 &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(wordpressAdminEmail))) &&
      (projectType !== "import" || Boolean(sourceDirectory)) &&
      (projectType !== "git" || /^(https:\/\/|ssh:\/\/|git@)/.test(repositoryUrl))) ||
    (step >= 2 &&
      step <= 5 &&
      (environmentMode === "existing"
        ? Boolean(environment)
        : environmentNameValid && !environmentConflict))
  const isNative = environmentMode === "new" && executionMode === "native"
  const next = () => {
    setError("")
    if (!canContinue) return
    if (step === 2 && isNative) {
      setStep(6)
      return
    }
    setStep((value) => Math.min(6, value + 1))
  }
  const create = async () => {
    if (busy || createdProjectId) return
    if (environmentMode === "existing" && !environment) return
    setBusy(true)
    creationStartedAt.current = Date.now()
    setCreationElapsed(0)
    setCreationProgress({ progress: 1, stage: text.preparingProject })
    setError("")
    const timestamp = Date.now()
    const id = `site-${timestamp}`
    const directory =
      projectType === "import" ? sourceDirectory : projectType === "git" ? repositoryUrl : ""
    const autoInit = projectType !== "git" && projectType !== "import" && autoInitGit
    try {
      let targetEnvironment = environmentId
      activeCreationEnvironment.current = targetEnvironment
      if (environmentMode === "existing") {
        const needsProvisioning =
          projectType === "wordpress" ||
          projectType === "laravel" ||
          projectType === "symfony" ||
          projectType === "import" ||
          projectType === "git"
        const site = {
          id,
          name,
          domain,
          environmentId,
          directory,
          projectType,
          autoInitGit: autoInit,
        }
        if (needsProvisioning) {
          await invoke("provision_site_in_environment", { site })
        } else {
          await invoke("create_site", { site })
          if (settings?.autoStartProjects)
            await invoke("operate_environment", { id: environmentId, action: "start" })
        }
      } else {
        const [databasePassword, databaseRootPassword] = await Promise.all([
          invoke<string>("generate_environment_secret", { length: 32 }),
          invoke<string>("generate_environment_secret", { length: 32 }),
        ])
        targetEnvironment = `env-${timestamp}`
        activeCreationEnvironment.current = targetEnvironment
        const payload: WizardEnvironmentPayload = {
          id: targetEnvironment,
          name: environmentName,
          webServer,
          webVersion: webServer === "Nginx" ? webVersion : "2.4",
          phpVersion,
          database,
          databaseVersion,
          port: nodePort,
          webContainerName: "",
          databaseContainerName: "",
          phpExtensions,
          extraServices: isNative ? services.filter((item) => item === "node") : services,
          nodeVersion,
          redisVersion: "7.4",
          databaseName,
          databaseUser,
          databasePassword,
          databaseRootPassword,
          phpMemoryLimit,
          phpUploadLimit,
          phpPostLimit: phpUploadLimit,
          phpExecutionTime,
          phpJit,
          phpJitMode,
          phpJitBufferSize,
          phpCron,
          phpCronSchedule,
          phpCronCommand,
          phpFpmProcessManager,
          phpFpmMaxChildren,
          phpFpmStartServers,
          phpFpmMinSpareServers,
          phpFpmMaxSpareServers,
          phpFpmMaxRequests,
          phpXdebug,
          phpXdebugMode,
          phpXdebugPort,
          phpXdebugStart,
          phpXdebugIdeKey,
          environmentVariables: {
            APP_ENV: appEnvironment,
            DB_CHARSET: databaseEncoding,
            LS_PANEL_AUTO_CREATE_DATABASE: String(autoCreateDatabase),
            ...(sqlDump ? { LS_PANEL_SQL_DUMP: sqlDump } : {}),
            NODE_INSTALL_COMMAND: nodeInstallCommand,
          },
          redisPassword: "",
          redisMemoryLimit: "256mb",
          redisEvictionPolicy: "allkeys-lru",
          nodePackageManager,
          nodeAutoInstall: true,
          nodeAutoRestart,
          nodeCommand,
          nodeRunMode,
          nodeDevCommand,
          nodeBuildCommand,
          nodeStartCommand,
          nodeInspector,
          nodeInspectorPort,
          runtimeMode: executionMode,
          composerVersion,
          restartPolicy: "unless-stopped",
          cpuLimit: "2.0",
          containerMemoryLimit: "2g",
          wordpressSiteTitle,
          wordpressAdminUser,
          wordpressAdminPassword,
          wordpressAdminEmail,
        }
        await invoke("create_project_environment", {
          site: {
            id,
            name,
            domain,
            environmentId: targetEnvironment,
            directory,
            projectType,
            autoInitGit: autoInit,
          },
          environment: payload,
        })
        if (settings && !settings.autoStartProjects)
          await invoke("operate_environment", { id: targetEnvironment, action: "stop" })
      }
      setCreationProgress({ progress: 100, stage: text.projectCreatedSuccessfully })
      setCreatedProjectId(id)
      setBusy(false)
    } catch (value) {
      setError(errorMessage(value))
      setBusy(false)
    }
  }
  const selectType = (type: string) => {
    setProjectType(type)
    if (!["node", "react", "static"].includes(type)) setExecutionMode("container")
    if (
      type === "wordpress" ||
      type === "laravel" ||
      type === "symfony" ||
      type === "node" ||
      type === "react" ||
      type === "import" ||
      type === "git"
    ) {
      setEnvironmentMode("new")
      if (type === "wordpress") {
        setDatabase("MariaDB")
        setDatabaseVersion("11.8")
        setServices((current) => (current.includes("adminer") ? current : [...current, "adminer"]))
        if (!wordpressSiteTitle) setWordpressSiteTitle(name || "My WordPress site")
        if (!wordpressAdminEmail) setWordpressAdminEmail(`admin@${domain || "wordpress.localhost"}`)
        if (!wordpressAdminPassword)
          void invoke<string>("generate_environment_secret", { length: 24 }).then(
            setWordpressAdminPassword,
          )
      }
      if (type === "node" || type === "react")
        setServices((current) => (current.includes("node") ? current : [...current, "node"]))
      if (type === "react") {
        setNodeCommand("npm run dev -- --host 0.0.0.0 --port 3000")
        setNodeDevCommand("npm run dev -- --host 0.0.0.0 --port 3000")
        setNodePort("3000")
      }
      if (!environmentName) setEnvironmentName(`${name || type}-env`)
    }
  }
  const chooseImportDirectory = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: text.chooseProjectDirectoryTitle,
    })
    if (typeof selected !== "string") return
    setSourceDirectory(selected)
    if (!name) {
      const detected =
        selected
          .split(/[\\/]/)
          .filter(Boolean)
          .pop()
          ?.replace(/[^A-Za-z0-9_-]/g, "-") || "imported-project"
      setName(detected)
      setDomain(`${detected.toLowerCase().replace(/_/g, "-")}.localhost`)
      setEnvironmentName(`${detected}-env`)
    }
  }
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3 lg:px-6">
        <Button variant="ghost" size="icon-sm" disabled={busy} onClick={onCancel}>
          <ArrowLeft />
        </Button>
        <div>
          <p className="text-sm font-medium">{text.createProject}</p>
          <p className="text-xs text-muted-foreground">
            {steps[step]} · {text.stepOf(step + 1, steps.length)}
          </p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="mx-auto grid max-w-3xl gap-5">
          <div className="grid gap-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{steps[step]}</span>
              <span>{Math.round(((step + 1) / steps.length) * 100)}%</span>
            </div>
            <Progress value={((step + 1) / steps.length) * 100} />
          </div>
          {executionMode !== "native" && runtime && !runtime.composeAvailable && (
            <Alert variant="destructive">
              <AlertDescription>{text.containerRuntimeNotReady}</AlertDescription>
            </Alert>
          )}
          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <TypeCard
                active={projectType === "php"}
                icon={<Code2 />}
                title={text.typePhpTitle}
                description={text.typePhpDescription}
                selectedLabel={text.selected}
                onClick={() => selectType("php")}
              />
              <TypeCard
                active={projectType === "static"}
                icon={<FileCode2 />}
                title={text.typeStaticTitle}
                description={text.typeStaticDescription}
                selectedLabel={text.selected}
                onClick={() => selectType("static")}
              />
              <TypeCard
                active={projectType === "wordpress"}
                icon={<W />}
                title={text.typeWordpressTitle}
                description={text.typeWordpressDescription}
                selectedLabel={text.selected}
                onClick={() => selectType("wordpress")}
              />
              <TypeCard
                active={projectType === "laravel"}
                icon={<Blocks />}
                title={text.typeLaravelTitle}
                description={text.typeLaravelDescription}
                selectedLabel={text.selected}
                onClick={() => selectType("laravel")}
              />
              <TypeCard
                active={projectType === "symfony"}
                icon={<Blocks />}
                title={text.typeSymfonyTitle}
                description={text.typeSymfonyDescription}
                selectedLabel={text.selected}
                onClick={() => selectType("symfony")}
              />
              <TypeCard
                active={projectType === "node"}
                icon={<Server />}
                title={text.typeNodeTitle}
                description={text.typeNodeDescription}
                selectedLabel={text.selected}
                onClick={() => selectType("node")}
              />
              <TypeCard
                active={projectType === "react"}
                icon={<Code2 />}
                title={text.typeReactTitle}
                description={text.typeReactDescription}
                selectedLabel={text.selected}
                onClick={() => selectType("react")}
              />
              <TypeCard
                active={projectType === "import"}
                icon={<Folder />}
                title={text.typeImportTitle}
                description={text.typeImportDescription}
                selectedLabel={text.selected}
                onClick={() => selectType("import")}
              />
              <TypeCard
                active={projectType === "git"}
                icon={<GitFork />}
                title={text.typeGitTitle}
                description={text.typeGitDescription}
                selectedLabel={text.selected}
                onClick={() => selectType("git")}
              />
            </div>
          )}
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle>{text.projectBasics}</CardTitle>
                <CardDescription>{text.projectBasicsDescription}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <Field label={text.nameLabel}>
                  <Input
                    autoFocus
                    value={name}
                    onChange={(event) => {
                      const value = event.target.value
                      setName(value)
                      setDomain(`${value.toLowerCase().replace(/_/g, "-")}.localhost`)
                    }}
                    placeholder="my-project"
                  />
                  <Hint valid={nameValid || !name} text={text.nameHint} />
                </Field>
                <Field label={text.localDomainLabel}>
                  <Input
                    value={domain}
                    onChange={(event) => setDomain(event.target.value.toLowerCase())}
                    placeholder="my-project.localhost"
                  />
                  <Hint valid={domainValid || !domain} text={text.domainHint} />
                </Field>
                <Field label={text.directoryLabel}>
                  <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
                    <Folder className="size-4" />
                    <code className="truncate">
                      {settings?.sitesDirectory ?? "LSP Sites"}/{name || "project"}
                    </code>
                  </div>
                </Field>
                {conflict && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {conflict.domain === domain ? text.domainTaken : text.nameTaken}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}
          {step === 1 && projectType === "import" && (
            <Card>
              <CardHeader>
                <CardTitle>{text.importSource}</CardTitle>
                <CardDescription>{text.importSourceDescription}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => void chooseImportDirectory()}
                >
                  <Folder />
                  {sourceDirectory || text.chooseDirectory}
                </Button>
                {!sourceDirectory && (
                  <p className="text-xs text-destructive">{text.chooseDirectoryRequired}</p>
                )}
              </CardContent>
            </Card>
          )}
          {step === 1 && projectType === "git" && (
            <Card>
              <CardHeader>
                <CardTitle>{text.gitRepository}</CardTitle>
                <CardDescription>{text.gitRepositoryDescription}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                <Label htmlFor="repository-url">{text.repositoryUrlLabel}</Label>
                <Input
                  id="repository-url"
                  value={repositoryUrl}
                  onChange={(event) => setRepositoryUrl(event.target.value.trim())}
                  placeholder="https://github.com/example/project.git"
                />
                <Hint
                  valid={!repositoryUrl || /^(https:\/\/|ssh:\/\/|git@)/.test(repositoryUrl)}
                  text={text.repositoryUrlHint}
                />
              </CardContent>
            </Card>
          )}
          {step === 1 && projectType === "wordpress" && (
            <Card>
              <CardHeader>
                <CardTitle>{text.wordpressAdmin}</CardTitle>
                <CardDescription>{text.wordpressAdminDescription}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field label={text.siteTitleLabel}>
                  <Input
                    value={wordpressSiteTitle}
                    onChange={(event) => setWordpressSiteTitle(event.target.value)}
                  />
                </Field>
                <Field label={text.adminUsernameLabel}>
                  <Input
                    value={wordpressAdminUser}
                    onChange={(event) => setWordpressAdminUser(event.target.value)}
                  />
                  <Hint valid={/^[A-Za-z0-9_-]+$/.test(wordpressAdminUser)} text={text.nameHint} />
                </Field>
                <Field label={text.adminEmailLabel}>
                  <Input
                    type="email"
                    value={wordpressAdminEmail}
                    onChange={(event) => setWordpressAdminEmail(event.target.value)}
                  />
                </Field>
                <Field label={text.adminPasswordLabel}>
                  <div className="flex gap-2">
                    <Input
                      type={showWordpressAdminPassword ? "text" : "password"}
                      value={wordpressAdminPassword}
                      onChange={(event) => setWordpressAdminPassword(event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title={showWordpressAdminPassword ? text.hidePassword : text.showPassword}
                      onClick={() => setShowWordpressAdminPassword((current) => !current)}
                    >
                      {showWordpressAdminPassword ? <EyeOff /> : <Eye />}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title={wordpressPasswordCopied ? text.copied : text.copyPassword}
                      disabled={!wordpressAdminPassword}
                      onClick={() => {
                        void navigator.clipboard.writeText(wordpressAdminPassword).then(() => {
                          setWordpressPasswordCopied(true)
                          window.setTimeout(() => setWordpressPasswordCopied(false), 1500)
                        })
                      }}
                    >
                      {wordpressPasswordCopied ? <Check /> : <Copy />}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        void invoke<string>("generate_environment_secret", { length: 24 }).then(
                          setWordpressAdminPassword,
                        )
                      }
                    >
                      {text.generate}
                    </Button>
                  </div>
                  <Hint valid={wordpressAdminPassword.length >= 8} text={text.passwordHint} />
                </Field>
              </CardContent>
            </Card>
          )}
          {step === 1 && projectType !== "git" && projectType !== "import" && (
            <label className="flex items-center gap-3 rounded-lg border p-4 text-sm">
              <Checkbox
                checked={autoInitGit}
                onCheckedChange={(value) => setAutoInitGit(Boolean(value))}
              />
              <span>
                <span className="block font-medium">{text.initializeGitRepository}</span>
                <span className="text-xs text-muted-foreground">
                  {text.initializeGitDescription}
                </span>
              </span>
            </label>
          )}
          {step === 2 && (
            <Card>
              <CardHeader>
                <CardTitle>{text.containerEnvironment}</CardTitle>
                <CardDescription>{text.containerEnvironmentDescription}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={environmentMode === "existing" ? "default" : "outline"}
                    disabled={!availableEnvironments.length}
                    onClick={() => setEnvironmentMode("existing")}
                  >
                    <Server />
                    {text.existing}
                  </Button>
                  <Button
                    variant={environmentMode === "new" ? "default" : "outline"}
                    onClick={() => {
                      setEnvironmentMode("new")
                      if (!environmentName) setEnvironmentName(`${name}-env`)
                    }}
                  >
                    <Server />
                    {text.createNew}
                  </Button>
                </div>
                {environmentMode === "existing" ? (
                  <>
                    <Field label={text.environmentLabel}>
                      <Select
                        value={environmentId}
                        onValueChange={(value) => value && setEnvironmentId(String(value))}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={text.selectEnvironment} />
                        </SelectTrigger>
                        <SelectContent>
                          {environments.map((item) => {
                            const occupied = occupiedEnvironmentIds.has(item.id)
                            return (
                              <SelectItem key={item.id} value={item.id} disabled={occupied}>
                                <span className="flex items-center gap-2">
                                  {item.name} · PHP {item.phpVersion}
                                  {occupied && (
                                    <Badge variant="outline">{text.occupiedBadge}</Badge>
                                  )}
                                </span>
                              </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                    </Field>
                    {!availableEnvironments.length && (
                      <Alert>
                        <AlertDescription>{text.allEnvironmentsOccupiedHint}</AlertDescription>
                      </Alert>
                    )}
                    {environment && (
                      <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3">
                        <Summary label={text.webServerLabel} value={environment.webServer} />
                        <Summary label="PHP" value={environment.phpVersion} />
                        <Summary
                          label={text.databaseLabel}
                          value={`${environment.database} ${environment.databaseVersion}`}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <Field label={text.environmentNameLabel}>
                      <Input
                        value={environmentName}
                        onChange={(event) => setEnvironmentName(event.target.value)}
                        placeholder={`${name || "project"}-env`}
                      />
                      <Hint
                        valid={(environmentNameValid && !environmentConflict) || !environmentName}
                        text={environmentConflict ? text.environmentNameTaken : text.nameHint}
                      />
                    </Field>
                    {(isNodeProject || projectType === "static") && (
                      <div className="grid gap-3 rounded-lg border p-4">
                        <Field label={text.executionModeLabel}>
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              type="button"
                              variant={executionMode === "container" ? "default" : "outline"}
                              onClick={() => setExecutionMode("container")}
                            >
                              <Server />
                              {text.containerRuntime}
                            </Button>
                            <Button
                              type="button"
                              variant={executionMode === "native" ? "default" : "outline"}
                              onClick={() => {
                                setExecutionMode("native")
                                void invoke<number>("allocate_native_port").then((port) =>
                                  setNodePort(String(port)),
                                )
                              }}
                            >
                              <Zap />
                              {text.nativeRuntime}
                            </Button>
                          </div>
                        </Field>
                        {executionMode === "native" && (
                          <p className="text-xs text-muted-foreground">{text.nativeRuntimeHint}</p>
                        )}
                      </div>
                    )}
                    {executionMode === "native" ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        {isNodeProject && (
                          <>
                            <Field label={text.nodeVersionLabel}>
                              <Choice
                                value={nodeVersion}
                                values={["24", "22", "20", "18"]}
                                onChange={setNodeVersion}
                              />
                            </Field>
                            <Field label={text.packageManagerLabel}>
                              <Choice
                                value={nodePackageManager}
                                values={["npm", "pnpm", "yarn"]}
                                onChange={setNodePackageManager}
                              />
                            </Field>
                            <Field label={text.devCommandLabel}>
                              <Input
                                value={nodeDevCommand}
                                onChange={(event) => setNodeDevCommand(event.target.value)}
                              />
                            </Field>
                            <Field label={text.buildCommandLabel}>
                              <Input
                                value={nodeBuildCommand}
                                onChange={(event) => setNodeBuildCommand(event.target.value)}
                              />
                            </Field>
                            <Field label={text.startCommandLabel}>
                              <Input
                                value={nodeStartCommand}
                                onChange={(event) => setNodeStartCommand(event.target.value)}
                              />
                            </Field>
                            <Field label={text.activeRunCommandLabel}>
                              <Choice
                                value={nodeRunMode}
                                values={["dev", "start"]}
                                onChange={setNodeRunMode}
                              />
                            </Field>
                            <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                              <Checkbox
                                checked={nodeAutoRestart}
                                onCheckedChange={(checked) => setNodeAutoRestart(Boolean(checked))}
                              />
                              {text.restartNodeAutomatically}
                            </label>
                          </>
                        )}
                        <Field label={text.portLabel}>
                          <Input
                            inputMode="numeric"
                            value={nodePort}
                            onChange={(event) => setNodePort(event.target.value)}
                          />
                        </Field>
                      </div>
                    ) : isNodeProject ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={text.nodeVersionLabel}>
                          <Choice
                            value={nodeVersion}
                            values={["24", "22", "20", "18"]}
                            onChange={setNodeVersion}
                          />
                        </Field>
                        <Field label={text.packageManagerLabel}>
                          <Choice
                            value={nodePackageManager}
                            values={["npm", "pnpm", "yarn"]}
                            onChange={setNodePackageManager}
                          />
                        </Field>
                        <Field label={text.installCommandLabel}>
                          <Input
                            value={nodeInstallCommand}
                            onChange={(event) => setNodeInstallCommand(event.target.value)}
                          />
                        </Field>
                        <Field label={text.startCommandLabel}>
                          <Input
                            value={nodeStartCommand}
                            onChange={(event) => setNodeStartCommand(event.target.value)}
                          />
                        </Field>
                        <Field label={text.devCommandLabel}>
                          <Input
                            value={nodeDevCommand}
                            onChange={(event) => setNodeDevCommand(event.target.value)}
                          />
                        </Field>
                        <Field label={text.buildCommandLabel}>
                          <Input
                            value={nodeBuildCommand}
                            onChange={(event) => setNodeBuildCommand(event.target.value)}
                          />
                        </Field>
                        <Field label={text.portLabel}>
                          <Input
                            inputMode="numeric"
                            value={nodePort}
                            onChange={(event) => setNodePort(event.target.value)}
                          />
                        </Field>
                        <Field label={text.modeLabel}>
                          <Choice
                            value={runtimeMode}
                            values={["development", "production"]}
                            onChange={setRuntimeMode}
                          />
                        </Field>
                        <Field label={text.activeRunCommandLabel}>
                          <Choice
                            value={nodeRunMode}
                            values={["dev", "start"]}
                            onChange={setNodeRunMode}
                          />
                        </Field>
                        <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                          <Checkbox
                            checked={nodeAutoRestart}
                            onCheckedChange={(checked) => setNodeAutoRestart(Boolean(checked))}
                          />
                          {text.restartNodeAutomatically}
                        </label>
                        <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                          <Checkbox
                            checked={nodeInspector}
                            onCheckedChange={(checked) => setNodeInspector(Boolean(checked))}
                          />
                          {text.enableNodeInspector}
                        </label>
                        <NumericInput
                          label={text.inspectorPortLabel}
                          value={nodeInspectorPort}
                          onChange={setNodeInspectorPort}
                        />
                      </div>
                    ) : (
                      <>
                        <div className="grid gap-4 sm:grid-cols-3">
                          <Field label={text.phpVersionLabel}>
                            <Choice
                              value={phpVersion}
                              values={[...PHP_VERSIONS]}
                              onChange={setPhpVersion}
                            />
                          </Field>
                          <Field label={text.composerLabel}>
                            <Choice
                              value={composerVersion}
                              values={["2", "2.8", "2.7"]}
                              onChange={setComposerVersion}
                            />
                          </Field>
                          <Field label={text.modeLabel}>
                            <Choice
                              value={runtimeMode}
                              values={["development", "production"]}
                              onChange={setRuntimeMode}
                            />
                          </Field>
                          <Field label="memory_limit">
                            <Input
                              value={phpMemoryLimit}
                              onChange={(event) => setPhpMemoryLimit(event.target.value)}
                            />
                          </Field>
                          <Field label="upload_max_filesize">
                            <Input
                              value={phpUploadLimit}
                              onChange={(event) => setPhpUploadLimit(event.target.value)}
                            />
                          </Field>
                          <Field label="max_execution_time">
                            <Input
                              type="number"
                              value={phpExecutionTime}
                              onChange={(event) => setPhpExecutionTime(Number(event.target.value))}
                            />
                          </Field>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-4">
                          {PHP_EXTENSIONS.map((extension) => (
                            <label
                              key={extension}
                              className="flex items-center gap-2 rounded-lg border p-3 text-sm"
                            >
                              <Checkbox
                                checked={phpExtensions.includes(extension)}
                                onCheckedChange={() =>
                                  setPhpExtensions((current) =>
                                    current.includes(extension)
                                      ? current.filter((item) => item !== extension)
                                      : [...current, extension],
                                  )
                                }
                              />
                              {extension}
                            </label>
                          ))}
                        </div>
                        <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
                          <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={phpJit}
                              onCheckedChange={(checked) => {
                                const enabled = Boolean(checked)
                                setPhpJit(enabled)
                                if (enabled)
                                  setPhpExtensions((current) =>
                                    current.includes("opcache") ? current : [...current, "opcache"],
                                  )
                              }}
                            />
                            {text.enablePhpJit}
                          </label>
                          <Field label={text.jitModeLabel}>
                            <Choice
                              value={phpJitMode}
                              values={["tracing", "function"]}
                              onChange={setPhpJitMode}
                            />
                          </Field>
                          <Field label={text.jitBufferSizeLabel}>
                            <Input
                              value={phpJitBufferSize}
                              onChange={(event) => setPhpJitBufferSize(event.target.value)}
                            />
                          </Field>
                        </div>
                        <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
                          <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={phpXdebug}
                              onCheckedChange={(checked) => {
                                const enabled = Boolean(checked)
                                setPhpXdebug(enabled)
                                if (enabled)
                                  setPhpExtensions((current) =>
                                    current.includes("xdebug") ? current : [...current, "xdebug"],
                                  )
                              }}
                            />
                            {text.enableXdebug}
                          </label>
                          <Field label={text.xdebugModeLabel}>
                            <Choice
                              value={phpXdebugMode}
                              values={["debug", "develop,debug", "debug,coverage"]}
                              onChange={setPhpXdebugMode}
                            />
                          </Field>
                          <Field label={text.startWithRequestLabel}>
                            <Choice
                              value={phpXdebugStart}
                              values={["trigger", "yes", "no"]}
                              onChange={setPhpXdebugStart}
                            />
                          </Field>
                          <NumericInput
                            label={text.debugPortLabel}
                            value={phpXdebugPort}
                            onChange={setPhpXdebugPort}
                          />
                          <Field label={text.ideKeyLabel}>
                            <Input
                              value={phpXdebugIdeKey}
                              onChange={(event) => setPhpXdebugIdeKey(event.target.value)}
                            />
                          </Field>
                        </div>
                        <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                          <label className="flex items-center gap-2 text-sm sm:col-span-2">
                            <Checkbox
                              checked={phpCron}
                              onCheckedChange={(checked) => setPhpCron(Boolean(checked))}
                            />
                            {text.enablePhpCron}
                          </label>
                          <Field label={text.cronScheduleLabel}>
                            <Input
                              value={phpCronSchedule}
                              disabled={!phpCron}
                              placeholder="* * * * *"
                              onChange={(event) => setPhpCronSchedule(event.target.value)}
                            />
                          </Field>
                          <Field label={text.commandLabel}>
                            <Input
                              value={phpCronCommand}
                              disabled={!phpCron}
                              onChange={(event) => setPhpCronCommand(event.target.value)}
                            />
                          </Field>
                        </div>
                        {webServer === "Nginx" && (
                          <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
                            <Field label={text.phpFpmManagerLabel}>
                              <Choice
                                value={phpFpmProcessManager}
                                values={["dynamic", "ondemand", "static"]}
                                onChange={setPhpFpmProcessManager}
                              />
                            </Field>
                            <NumericInput
                              label={text.maxChildrenLabel}
                              value={phpFpmMaxChildren}
                              onChange={setPhpFpmMaxChildren}
                            />
                            <NumericInput
                              label={text.maxRequestsLabel}
                              value={phpFpmMaxRequests}
                              onChange={setPhpFpmMaxRequests}
                            />
                            {phpFpmProcessManager === "dynamic" && (
                              <>
                                <NumericInput
                                  label={text.startServersLabel}
                                  value={phpFpmStartServers}
                                  onChange={setPhpFpmStartServers}
                                />
                                <NumericInput
                                  label={text.minSpareServersLabel}
                                  value={phpFpmMinSpareServers}
                                  onChange={setPhpFpmMinSpareServers}
                                />
                                <NumericInput
                                  label={text.maxSpareServersLabel}
                                  value={phpFpmMaxSpareServers}
                                  onChange={setPhpFpmMaxSpareServers}
                                />
                              </>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}
          {step === 3 && environmentMode === "new" && (
            <Card>
              <CardHeader>
                <CardTitle>{text.webServerLabel}</CardTitle>
                <CardDescription>{text.webServerDescription}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field label={text.serverLabel}>
                  <Choice
                    value={webServer}
                    values={["Nginx", "Apache"]}
                    onChange={(value) => {
                      setWebServer(value)
                      setWebVersion(WEB_SERVER_VERSIONS[value]?.[0] ?? "2.4")
                    }}
                  />
                </Field>
                <Field label={text.versionLabel}>
                  {WEB_SERVER_VERSIONS[webServer] ? (
                    <Choice
                      value={webVersion}
                      values={WEB_SERVER_VERSIONS[webServer]}
                      onChange={setWebVersion}
                    />
                  ) : (
                    <p className="pt-2 text-sm text-muted-foreground">{text.bundledWithPhpImage}</p>
                  )}
                </Field>
                <Summary label={text.httpsRouteLabel} value={`https://${domain}`} />
                <Summary label={text.applicationPortLabel} value={nodePort} />
              </CardContent>
            </Card>
          )}
          {step === 3 && environmentMode === "existing" && (
            <ExistingEnvironmentNotice environment={environment} language={language} />
          )}
          {step === 4 && environmentMode === "new" && (
            <Card>
              <CardHeader>
                <CardTitle>{text.databaseLabel}</CardTitle>
                <CardDescription>{text.databaseCardDescription}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={text.engineLabel}>
                    <Choice
                      value={database}
                      values={["MariaDB", "MySQL", "PostgreSQL"]}
                      onChange={(value) => {
                        setDatabase(value)
                        setDatabaseVersion(defaultDatabaseVersion(value))
                      }}
                    />
                  </Field>
                  <Field label={text.versionLabel}>
                    <Choice
                      value={databaseVersion}
                      values={DATABASE_VERSIONS[database] ?? []}
                      onChange={setDatabaseVersion}
                    />
                  </Field>
                  <Field label={text.databaseNameLabel}>
                    <Input
                      value={databaseName}
                      onChange={(event) => setDatabaseName(event.target.value)}
                    />
                  </Field>
                  <Field label={text.userLabel}>
                    <Input
                      value={databaseUser}
                      onChange={(event) => setDatabaseUser(event.target.value)}
                    />
                  </Field>
                  <Field label={text.encodingLabel}>
                    <Choice
                      value={databaseEncoding}
                      values={["utf8mb4", "utf8", "UTF8"]}
                      onChange={setDatabaseEncoding}
                    />
                  </Field>
                  <Field label={text.sqlDumpLabel}>
                    <Input
                      value={sqlDump}
                      onChange={(event) => setSqlDump(event.target.value)}
                      placeholder="/path/to/dump.sql"
                    />
                  </Field>
                </div>
                <label className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                  <Checkbox
                    checked={autoCreateDatabase}
                    onCheckedChange={(value) => setAutoCreateDatabase(Boolean(value))}
                  />
                  {text.autoCreateDatabaseLabel}
                </label>
              </CardContent>
            </Card>
          )}
          {step === 4 && environmentMode === "existing" && (
            <ExistingEnvironmentNotice environment={environment} language={language} />
          )}
          {step === 5 && environmentMode === "new" && (
            <Card>
              <CardHeader>
                <CardTitle>{text.additionalServices}</CardTitle>
                <CardDescription>{text.additionalServicesDescription}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-3">
                {["redis", "mailpit", "adminer", "phpmyadmin"].map((service) => (
                  <label
                    key={service}
                    className="flex items-center gap-2 rounded-lg border p-3 text-sm"
                  >
                    <Checkbox
                      checked={services.includes(service)}
                      disabled={service === "phpmyadmin" && database === "PostgreSQL"}
                      onCheckedChange={() =>
                        setServices((current) =>
                          current.includes(service)
                            ? current.filter((item) => item !== service)
                            : [...current, service],
                        )
                      }
                    />
                    {service}
                  </label>
                ))}
              </CardContent>
            </Card>
          )}
          {step === 5 && environmentMode === "existing" && (
            <ExistingEnvironmentNotice environment={environment} language={language} />
          )}
          {step === 6 && (
            <Card>
              <CardHeader>
                <CardTitle>{text.reviewProject}</CardTitle>
                <CardDescription>{text.reviewProjectDescription}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <Summary
                  label={text.typeLabel}
                  value={text.typeNames[projectType] ?? projectType}
                />
                <Summary label={text.nameLabel} value={name} />
                <Summary label={text.domainLabel} value={domain} />
                <Summary
                  label={text.environmentLabel}
                  value={
                    environmentMode === "new"
                      ? `${environmentName} (new)`
                      : (environment?.name ?? "—")
                  }
                />
                {environmentMode === "new" && (
                  <>
                    <Summary
                      label={text.runtimeLabel}
                      value={
                        isNative
                          ? isNodeProject
                            ? `Node.js ${nodeVersion} · ${nodePackageManager}`
                            : text.nativeRuntimeStaticValue
                          : isNodeProject
                            ? `Node.js ${nodeVersion} · ${nodePackageManager} · ${appEnvironment}`
                            : `PHP ${phpVersion} · Composer ${composerVersion} · ${appEnvironment}`
                      }
                    />
                    {!isNative && (
                      <Summary
                        label={text.databaseLabel}
                        value={`${database} ${databaseVersion}`}
                      />
                    )}
                  </>
                )}
                <Summary
                  label={text.directoryLabel}
                  value={`${settings?.sitesDirectory ?? "LSP Sites"}/${name}`}
                />
                {projectType === "import" && (
                  <Summary label={text.importSource} value={sourceDirectory} />
                )}{" "}
                {projectType === "git" && (
                  <Summary label={text.repositoryLabel} value={repositoryUrl} />
                )}{" "}
                {projectType !== "git" && projectType !== "import" && (
                  <Summary
                    label={text.gitLabel}
                    value={autoInitGit ? text.initializeMainBranch : text.disabled}
                  />
                )}
                <Summary
                  label={text.localUrlLabel}
                  value={isNative ? text.nativeRuntimeUrlValue(nodePort) : `https://${domain}`}
                />
                <Summary
                  label={text.containersLabel}
                  value={
                    isNative
                      ? text.nativeRuntimeContainersValue
                      : environmentMode === "existing"
                        ? text.usesSelectedEnvironment
                        : [
                            isNodeProject ? "node" : webServer.toLowerCase(),
                            isNodeProject ? null : "php",
                            "database",
                            ...services,
                          ]
                            .filter(Boolean)
                            .join(", ")
                  }
                />
                {!isNative && (
                  <Summary
                    label={text.portsLabel}
                    value={text.portsValue(isNodeProject, nodePort)}
                  />
                )}
                {!isNative && (
                  <Summary
                    label={text.volumesLabel}
                    value={text.volumesValue(
                      name,
                      environmentName || environment?.name || text.environmentFallback,
                    )}
                  />
                )}
                <Summary
                  label={text.environmentLabel}
                  value={
                    environmentMode === "new"
                      ? isNative
                        ? `APP_ENV=${appEnvironment}`
                        : `APP_ENV=${appEnvironment} · DB_CHARSET=${databaseEncoding}`
                      : text.inheritedWithoutSecrets
                  }
                />
                {!isNative && (
                  <Summary
                    label={text.estimatedResourcesLabel}
                    value={text.estimatedResourcesValue(
                      environmentMode === "new" ? 2 + services.length : 0,
                    )}
                  />
                )}
              </CardContent>
            </Card>
          )}
          {step === 6 && conflict && (
            <Alert variant="destructive">
              <AlertDescription>
                {text.creationBlocked(
                  conflict.domain === domain ? text.domainWord : text.projectNameWord,
                )}
              </AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
      <div className="relative z-30 shrink-0 border-t bg-background px-4 py-3 shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.45)] lg:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <Button
            className="shrink-0"
            variant="outline"
            disabled={busy || Boolean(createdProjectId) || step === 0}
            onClick={() => {
              if (step === 6 && isNative) {
                setStep(2)
                return
              }
              setStep((value) => Math.max(0, value - 1))
            }}
          >
            <ArrowLeft />
            {text.back}
          </Button>
          <div className="min-w-0 flex-1">
            {(busy || createdProjectId) && (
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span className="truncate">{creationProgress.stage}</span>
                  <span className="shrink-0 tabular-nums">
                    {creationProgress.progress}% · {Math.floor(creationElapsed / 60)}:
                    {String(creationElapsed % 60).padStart(2, "0")}
                  </span>
                </div>
                <Progress
                  value={creationProgress.progress}
                  indeterminate={busy && [45, 75].includes(creationProgress.progress)}
                />
              </div>
            )}
          </div>
          {step < 6 ? (
            <Button className="shrink-0" disabled={!canContinue} onClick={next}>
              {text.continue}
              <ArrowRight />
            </Button>
          ) : createdProjectId ? (
            <Button className="shrink-0" onClick={() => onCreated(createdProjectId)}>
              <Check />
              {text.created}
            </Button>
          ) : (
            <Button
              className="shrink-0"
              disabled={
                busy || Boolean(conflict) || (environmentMode === "existing" && !environment)
              }
              onClick={() => void create()}
            >
              {busy ? (
                text.buildingProject
              ) : (
                <>
                  <Check />
                  {text.createProject}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
function TypeCard({
  active,
  icon,
  title,
  description,
  selectedLabel,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  title: string
  description: string
  selectedLabel: string
  onClick: () => void
}) {
  return (
    <Card
      className={active ? "border-primary ring-1 ring-primary" : "cursor-pointer"}
      onClick={onClick}
    >
      <CardHeader>
        <div className="mb-2 flex items-center justify-between">
          <span className="grid size-9 place-items-center rounded-lg border">{icon}</span>
          {active && <Badge>{selectedLabel}</Badge>}
        </div>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
function Hint({ valid, text }: { valid: boolean; text: string }) {
  return (
    <p className={valid ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>{text}</p>
  )
}
function NumericInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </Field>
  )
}
function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium">{value}</p>
    </div>
  )
}
function ExistingEnvironmentNotice({
  environment,
  language,
}: {
  environment?: Environment
  language: string
}) {
  const text = pickLanguage(language).projectWizard
  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.inheritedEnvironmentSettings}</CardTitle>
        <CardDescription>{text.inheritedEnvironmentDescription}</CardDescription>
      </CardHeader>
      {environment && (
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Summary label={text.webServerLabel} value={environment.webServer} />
          <Summary label="PHP" value={environment.phpVersion} />
          <Summary
            label={text.databaseLabel}
            value={`${environment.database} ${environment.databaseVersion}`}
          />
        </CardContent>
      )}
    </Card>
  )
}
function Choice({
  value,
  values,
  onChange,
}: {
  value: string
  values: string[]
  onChange: (value: string) => void
}) {
  return (
    <Select value={value} onValueChange={(next) => next && onChange(String(next))}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {values.map((item) => (
          <SelectItem key={item} value={item}>
            {item}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
