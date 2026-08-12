import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { errorMessage } from "@/lib/errors"
import { listen } from "@tauri-apps/api/event"
import { open } from "@tauri-apps/plugin-dialog"
import { ArrowLeft, ArrowRight, Check } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { pickLanguage } from "@/i18n"
import { WEB_SERVER_VERSIONS } from "@/lib/version-catalog"
import type { Environment, Runtime, Site } from "@/types"

import { ExistingEnvironmentNotice } from "./form-fields"
import { buildEnvironmentPayload } from "./helpers"
import { ImportSourcePanel } from "./components/import-source-panel"
import { GitRepoPanel } from "./components/git-repo-panel"
import { WordpressAdminPanel } from "./components/wordpress-admin-panel"
import { NodeRuntimeFields } from "./components/node-runtime-fields"
import { PhpRuntimeFields } from "./components/php-runtime-fields"
import { TypePickerStep } from "./components/steps/type-picker-step"
import { BasicsStep } from "./components/steps/basics-step"
import { EnvironmentStep } from "./components/steps/environment-step"
import { WebServerStep } from "./components/steps/web-server-step"
import { DatabaseStep } from "./components/steps/database-step"
import { ServicesStep } from "./components/steps/services-step"
import { ReviewStep } from "./components/steps/review-step"
import type { OperationProgress, Settings } from "./types"

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
  // Once creation has succeeded, the just-created site can itself show up in
  // `sites` (refreshed via the "environments-changed" event the backend
  // emits right after creating it) while the wizard is still mounted on the
  // review step — without this guard, the wizard's own new site would match
  // its own domain/name and get flagged as a conflict with itself.
  const conflict = createdProjectId
    ? undefined
    : sites.find((site) => site.domain === domain || site.name === name)
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
        const payload = buildEnvironmentPayload({
          id: targetEnvironment,
          name: environmentName,
          webServer,
          webVersion,
          phpVersion,
          database,
          databaseVersion,
          nodePort,
          phpExtensions,
          isNative,
          services,
          nodeVersion,
          databaseName,
          databaseUser,
          databasePassword,
          databaseRootPassword,
          phpMemoryLimit,
          phpUploadLimit,
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
          appEnvironment,
          databaseEncoding,
          autoCreateDatabase,
          sqlDump,
          nodeInstallCommand,
          nodePackageManager,
          nodeAutoRestart,
          nodeCommand,
          nodeRunMode,
          nodeDevCommand,
          nodeBuildCommand,
          nodeStartCommand,
          nodeInspector,
          nodeInspectorPort,
          executionMode,
          composerVersion,
          wordpressSiteTitle,
          wordpressAdminUser,
          wordpressAdminPassword,
          wordpressAdminEmail,
        })
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
            <TypePickerStep projectType={projectType} selectType={selectType} language={language} />
          )}
          {step === 1 && (
            <BasicsStep
              name={name}
              setName={setName}
              domain={domain}
              setDomain={setDomain}
              nameValid={nameValid}
              domainValid={domainValid}
              settings={settings}
              conflict={conflict}
              language={language}
            />
          )}
          {step === 1 && projectType === "import" && (
            <ImportSourcePanel
              sourceDirectory={sourceDirectory}
              chooseImportDirectory={chooseImportDirectory}
              language={language}
            />
          )}
          {step === 1 && projectType === "git" && (
            <GitRepoPanel
              repositoryUrl={repositoryUrl}
              setRepositoryUrl={setRepositoryUrl}
              language={language}
            />
          )}
          {step === 1 && projectType === "wordpress" && (
            <WordpressAdminPanel
              wordpressSiteTitle={wordpressSiteTitle}
              setWordpressSiteTitle={setWordpressSiteTitle}
              wordpressAdminUser={wordpressAdminUser}
              setWordpressAdminUser={setWordpressAdminUser}
              wordpressAdminEmail={wordpressAdminEmail}
              setWordpressAdminEmail={setWordpressAdminEmail}
              wordpressAdminPassword={wordpressAdminPassword}
              setWordpressAdminPassword={setWordpressAdminPassword}
              showWordpressAdminPassword={showWordpressAdminPassword}
              setShowWordpressAdminPassword={setShowWordpressAdminPassword}
              wordpressPasswordCopied={wordpressPasswordCopied}
              setWordpressPasswordCopied={setWordpressPasswordCopied}
              language={language}
            />
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
            <EnvironmentStep
              environments={environments}
              occupiedEnvironmentIds={occupiedEnvironmentIds}
              availableEnvironments={availableEnvironments}
              environmentId={environmentId}
              setEnvironmentId={setEnvironmentId}
              environment={environment}
              environmentMode={environmentMode}
              setEnvironmentMode={setEnvironmentMode}
              environmentName={environmentName}
              setEnvironmentName={setEnvironmentName}
              environmentNameValid={environmentNameValid}
              environmentConflict={environmentConflict}
              name={name}
              projectType={projectType}
              isNodeProject={isNodeProject}
              executionMode={executionMode}
              setExecutionMode={setExecutionMode}
              setNodePort={setNodePort}
              language={language}
            >
              {executionMode === "native" ? (
                <NodeRuntimeFields
                  mode="native"
                  isNodeProject={isNodeProject}
                  nodeVersion={nodeVersion}
                  setNodeVersion={setNodeVersion}
                  nodePackageManager={nodePackageManager}
                  setNodePackageManager={setNodePackageManager}
                  nodeInstallCommand={nodeInstallCommand}
                  setNodeInstallCommand={setNodeInstallCommand}
                  nodeDevCommand={nodeDevCommand}
                  setNodeDevCommand={setNodeDevCommand}
                  nodeBuildCommand={nodeBuildCommand}
                  setNodeBuildCommand={setNodeBuildCommand}
                  nodeStartCommand={nodeStartCommand}
                  setNodeStartCommand={setNodeStartCommand}
                  nodeCommand={nodeCommand}
                  setNodeCommand={setNodeCommand}
                  nodePort={nodePort}
                  setNodePort={setNodePort}
                  runtimeMode={runtimeMode}
                  setRuntimeMode={setRuntimeMode}
                  nodeRunMode={nodeRunMode}
                  setNodeRunMode={setNodeRunMode}
                  nodeAutoRestart={nodeAutoRestart}
                  setNodeAutoRestart={setNodeAutoRestart}
                  nodeInspector={nodeInspector}
                  setNodeInspector={setNodeInspector}
                  nodeInspectorPort={nodeInspectorPort}
                  setNodeInspectorPort={setNodeInspectorPort}
                  language={language}
                />
              ) : isNodeProject ? (
                <NodeRuntimeFields
                  mode="container"
                  isNodeProject={isNodeProject}
                  nodeVersion={nodeVersion}
                  setNodeVersion={setNodeVersion}
                  nodePackageManager={nodePackageManager}
                  setNodePackageManager={setNodePackageManager}
                  nodeInstallCommand={nodeInstallCommand}
                  setNodeInstallCommand={setNodeInstallCommand}
                  nodeDevCommand={nodeDevCommand}
                  setNodeDevCommand={setNodeDevCommand}
                  nodeBuildCommand={nodeBuildCommand}
                  setNodeBuildCommand={setNodeBuildCommand}
                  nodeStartCommand={nodeStartCommand}
                  setNodeStartCommand={setNodeStartCommand}
                  nodeCommand={nodeCommand}
                  setNodeCommand={setNodeCommand}
                  nodePort={nodePort}
                  setNodePort={setNodePort}
                  runtimeMode={runtimeMode}
                  setRuntimeMode={setRuntimeMode}
                  nodeRunMode={nodeRunMode}
                  setNodeRunMode={setNodeRunMode}
                  nodeAutoRestart={nodeAutoRestart}
                  setNodeAutoRestart={setNodeAutoRestart}
                  nodeInspector={nodeInspector}
                  setNodeInspector={setNodeInspector}
                  nodeInspectorPort={nodeInspectorPort}
                  setNodeInspectorPort={setNodeInspectorPort}
                  language={language}
                />
              ) : (
                <PhpRuntimeFields
                  phpVersion={phpVersion}
                  setPhpVersion={setPhpVersion}
                  composerVersion={composerVersion}
                  setComposerVersion={setComposerVersion}
                  runtimeMode={runtimeMode}
                  setRuntimeMode={setRuntimeMode}
                  phpMemoryLimit={phpMemoryLimit}
                  setPhpMemoryLimit={setPhpMemoryLimit}
                  phpUploadLimit={phpUploadLimit}
                  setPhpUploadLimit={setPhpUploadLimit}
                  phpExecutionTime={phpExecutionTime}
                  setPhpExecutionTime={setPhpExecutionTime}
                  phpExtensions={phpExtensions}
                  setPhpExtensions={setPhpExtensions}
                  phpJit={phpJit}
                  setPhpJit={setPhpJit}
                  phpJitMode={phpJitMode}
                  setPhpJitMode={setPhpJitMode}
                  phpJitBufferSize={phpJitBufferSize}
                  setPhpJitBufferSize={setPhpJitBufferSize}
                  phpXdebug={phpXdebug}
                  setPhpXdebug={setPhpXdebug}
                  phpXdebugMode={phpXdebugMode}
                  setPhpXdebugMode={setPhpXdebugMode}
                  phpXdebugStart={phpXdebugStart}
                  setPhpXdebugStart={setPhpXdebugStart}
                  phpXdebugPort={phpXdebugPort}
                  setPhpXdebugPort={setPhpXdebugPort}
                  phpXdebugIdeKey={phpXdebugIdeKey}
                  setPhpXdebugIdeKey={setPhpXdebugIdeKey}
                  phpCron={phpCron}
                  setPhpCron={setPhpCron}
                  phpCronSchedule={phpCronSchedule}
                  setPhpCronSchedule={setPhpCronSchedule}
                  phpCronCommand={phpCronCommand}
                  setPhpCronCommand={setPhpCronCommand}
                  phpFpmProcessManager={phpFpmProcessManager}
                  setPhpFpmProcessManager={setPhpFpmProcessManager}
                  phpFpmMaxChildren={phpFpmMaxChildren}
                  setPhpFpmMaxChildren={setPhpFpmMaxChildren}
                  phpFpmMaxRequests={phpFpmMaxRequests}
                  setPhpFpmMaxRequests={setPhpFpmMaxRequests}
                  phpFpmStartServers={phpFpmStartServers}
                  setPhpFpmStartServers={setPhpFpmStartServers}
                  phpFpmMinSpareServers={phpFpmMinSpareServers}
                  setPhpFpmMinSpareServers={setPhpFpmMinSpareServers}
                  phpFpmMaxSpareServers={phpFpmMaxSpareServers}
                  setPhpFpmMaxSpareServers={setPhpFpmMaxSpareServers}
                  webServer={webServer}
                  language={language}
                />
              )}
            </EnvironmentStep>
          )}
          {step === 3 && environmentMode === "new" && (
            <WebServerStep
              webServer={webServer}
              setWebServer={setWebServer}
              webVersion={webVersion}
              setWebVersion={setWebVersion}
              domain={domain}
              nodePort={nodePort}
              language={language}
            />
          )}
          {step === 3 && environmentMode === "existing" && (
            <ExistingEnvironmentNotice environment={environment} language={language} />
          )}
          {step === 4 && environmentMode === "new" && (
            <DatabaseStep
              database={database}
              setDatabase={setDatabase}
              databaseVersion={databaseVersion}
              setDatabaseVersion={setDatabaseVersion}
              databaseName={databaseName}
              setDatabaseName={setDatabaseName}
              databaseUser={databaseUser}
              setDatabaseUser={setDatabaseUser}
              databaseEncoding={databaseEncoding}
              setDatabaseEncoding={setDatabaseEncoding}
              sqlDump={sqlDump}
              setSqlDump={setSqlDump}
              autoCreateDatabase={autoCreateDatabase}
              setAutoCreateDatabase={setAutoCreateDatabase}
              language={language}
            />
          )}
          {step === 4 && environmentMode === "existing" && (
            <ExistingEnvironmentNotice environment={environment} language={language} />
          )}
          {step === 5 && environmentMode === "new" && (
            <ServicesStep
              services={services}
              setServices={setServices}
              database={database}
              language={language}
            />
          )}
          {step === 5 && environmentMode === "existing" && (
            <ExistingEnvironmentNotice environment={environment} language={language} />
          )}
          {step === 6 && (
            <ReviewStep
              projectType={projectType}
              name={name}
              domain={domain}
              settings={settings}
              environmentMode={environmentMode}
              environmentName={environmentName}
              environment={environment}
              isNative={isNative}
              isNodeProject={isNodeProject}
              appEnvironment={appEnvironment}
              nodeVersion={nodeVersion}
              nodePackageManager={nodePackageManager}
              phpVersion={phpVersion}
              composerVersion={composerVersion}
              database={database}
              databaseVersion={databaseVersion}
              databaseEncoding={databaseEncoding}
              sourceDirectory={sourceDirectory}
              repositoryUrl={repositoryUrl}
              autoInitGit={autoInitGit}
              nodePort={nodePort}
              webServer={webServer}
              services={services}
              conflict={conflict}
              language={language}
            />
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
