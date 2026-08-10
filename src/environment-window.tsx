import React from "react"
import { emit, listen } from "@tauri-apps/api/event"
import { invoke } from "@tauri-apps/api/core"
import { errorMessage } from "@/lib/errors"
import {
  ArrowLeft,
  Check,
  Copy,
  Eye,
  EyeOff,
  Play,
  RefreshCw,
  RotateCw,
  Save,
  Settings2,
  Square,
  TerminalSquare,
  Trash2,
} from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { pickLanguage } from "@/i18n"
import { applyTheme } from "@/theme"
import type { AppSettings } from "@/welcome-screen"
import {
  DATABASE_VERSIONS,
  PHP_EXTENSIONS,
  PHP_VERSIONS,
  WEB_SERVER_VERSIONS,
  defaultDatabaseVersion,
} from "@/lib/version-catalog"
import type { Environment } from "@/types"

type Inspection = {
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
type Runtime = { running: boolean; composeAvailable: boolean; message: string }
type OperationProgress = { id: string; progress: number; stage: string; indeterminate: boolean }

const defaults = (): Environment => ({
  id: `env-${Date.now()}`,
  name: "local",
  webServer: "Nginx",
  webVersion: "1.28",
  phpVersion: "8.4",
  database: "MariaDB",
  databaseVersion: "11.8",
  port: "8080",
  webContainerName: "",
  databaseContainerName: "",
  phpExtensions: ["intl", "mbstring", "opcache", "zip"],
  extraServices: [],
  nodeVersion: "22",
  redisVersion: "7.4",
  databaseName: "app",
  databaseUser: "app",
  databasePassword: "localdev",
  databaseRootPassword: "localdev",
  phpMemoryLimit: "256M",
  phpUploadLimit: "64M",
  phpPostLimit: "64M",
  phpExecutionTime: 120,
  phpJit: false,
  phpJitMode: "tracing",
  phpJitBufferSize: "64M",
  phpCron: false,
  phpCronSchedule: "* * * * *",
  phpCronCommand: "php artisan schedule:run",
  phpFpmProcessManager: "dynamic",
  phpFpmMaxChildren: 10,
  phpFpmStartServers: 2,
  phpFpmMinSpareServers: 1,
  phpFpmMaxSpareServers: 3,
  phpFpmMaxRequests: 500,
  phpXdebug: false,
  phpXdebugMode: "develop,debug",
  phpXdebugPort: 9003,
  phpXdebugStart: "trigger",
  phpXdebugIdeKey: "LSPANEL",
  environmentVariables: {},
  redisPassword: "",
  redisMemoryLimit: "256mb",
  redisEvictionPolicy: "allkeys-lru",
  elasticsearchVersion: "8.15.3",
  elasticsearchMemoryLimit: "512m",
  minioVersion: "RELEASE.2024-11-07T00-52-20Z",
  minioRootUser: "minioadmin",
  minioRootPassword: "minioadmin123",
  rabbitmqVersion: "3.13",
  rabbitmqUser: "guest",
  rabbitmqPassword: "guest",
  nodePackageManager: "npm",
  nodeAutoInstall: true,
  nodeAutoRestart: true,
  nodeCommand: "",
  nodeRunMode: "dev",
  nodeDevCommand: "npm run dev -- --host 0.0.0.0",
  nodeBuildCommand: "npm run build",
  nodeStartCommand: "npm start",
  nodeInspector: false,
  nodeInspectorPort: 9229,
  composerVersion: "2",
  restartPolicy: "unless-stopped",
  cpuLimit: "2.0",
  containerMemoryLimit: "2g",
  runtimeMode: "container",
  backupScheduleEnabled: false,
  backupScheduleIntervalHours: 24,
  backupRetentionCount: 7,
  wordpressSiteTitle: "",
  wordpressAdminUser: "",
  wordpressAdminPassword: "",
  wordpressAdminEmail: "",
})
const services = [
  "redis",
  "node",
  "mailpit",
  "adminer",
  "phpmyadmin",
  "elasticsearch",
  "minio",
  "rabbitmq",
]

export function EnvironmentWindow({
  environmentId,
  language,
  onBack,
  onSaved,
}: {
  environmentId: string
  language: string
  onBack: () => void
  onSaved: (id: string) => void
}) {
  const text = pickLanguage(language).environmentWindow
  const id = environmentId
  const [draft, setDraft] = React.useState<Environment | null>(null)
  const [variables, setVariables] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState("")
  const [messageOk, setMessageOk] = React.useState(false)
  const [inspection, setInspection] = React.useState<Inspection | null>(null)
  const [runtime, setRuntime] = React.useState<Runtime | null>(null)
  const [progress, setProgress] = React.useState<OperationProgress | null>(null)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleteProgress, setDeleteProgress] = React.useState<{
    value: number
    stage: string
  } | null>(null)
  const [serviceDialog, setServiceDialog] = React.useState<{
    name: string
    containerName: string
    configuration: string
  } | null>(null)
  const [topology, setTopology] = React.useState("")
  const [serviceCommand, setServiceCommand] = React.useState("")
  const [serviceOutput, setServiceOutput] = React.useState("")
  const [phpInfo, setPhpInfo] = React.useState<string | null>(null)
  const [nodeScripts, setNodeScripts] = React.useState<string | null>(null)
  const [nodeScriptOutput, setNodeScriptOutput] = React.useState("")
  const [xdebugIde, setXdebugIde] = React.useState("VS Code")
  const [xdebugConfigOpen, setXdebugConfigOpen] = React.useState(false)
  const [nodeInspectorConfigOpen, setNodeInspectorConfigOpen] = React.useState(false)
  React.useEffect(() => {
    Promise.all([
      invoke<Environment[]>("list_environments"),
      invoke<AppSettings | null>("load_settings"),
    ])
      .then(([items, settings]) => {
        if (settings) applyTheme(settings.theme)
        const value = items.find((item) => item.id === id) ?? defaults()
        setDraft(value)
        setVariables(
          Object.entries(value.environmentVariables ?? {})
            .map(([key, value]) => `${key}=${value}`)
            .join("\n"),
        )
      })
      .catch((error) => setMessage(errorMessage(error)))
  }, [id])
  const inspect = React.useCallback(async () => {
    if (!id) return
    try {
      const [nextInspection, nextRuntime, nextTopology] = await Promise.all([
        invoke<Inspection>("inspect_environment", { id }),
        invoke<Runtime>("container_runtime_status"),
        invoke<string>("environment_topology", { id }),
      ])
      setInspection(nextInspection)
      setRuntime(nextRuntime)
      setTopology(nextTopology)
    } catch (error) {
      setMessage(errorMessage(error))
    }
  }, [id])
  React.useEffect(() => {
    void inspect()
    const unlisten = listen<OperationProgress>("environment-progress", (event) => {
      if (event.payload.id === id) setProgress(event.payload)
    })
    return () => {
      void unlisten.then((dispose) => dispose())
    }
  }, [id, inspect])
  if (!draft)
    return (
      <div className="grid size-full place-items-center text-sm text-muted-foreground">
        {text.loadingEnvironment}
      </div>
    )
  const update = <K extends keyof Environment>(key: K, value: Environment[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current))
  const toggle = (key: "phpExtensions" | "extraServices", value: string) =>
    update(
      key,
      draft[key].includes(value)
        ? draft[key].filter((item) => item !== value)
        : [...draft[key], value],
    )
  async function save() {
    const current = draft
    if (!current) return
    setBusy(true)
    setMessage("")
    try {
      const environmentVariables = Object.fromEntries(
        variables
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const index = line.indexOf("=")
            return index < 1 ? [line, ""] : [line.slice(0, index), line.slice(index + 1)]
          }),
      )
      const environment = { ...current, environmentVariables }
      await invoke("save_environment", { environment })
      await emit("environments-changed")
      setMessage(id ? text.environmentSaved : text.environmentBuiltAndStarted)
      setMessageOk(true)
      await onSaved(current.id)
    } catch (error) {
      setMessage(errorMessage(error))
      setMessageOk(false)
    } finally {
      setBusy(false)
    }
  }
  async function remove() {
    const current = draft
    if (!current) return
    setBusy(true)
    setMessage("")
    setDeleteProgress({ value: 10, stage: text.preparingRemoval })
    try {
      setDeleteProgress({ value: 35, stage: text.stoppingContainers })
      await invoke("operate_environment", { id: current.id, action: "destroy" })
      setDeleteProgress({ value: 85, stage: text.removingData })
      await invoke("delete_environment", { id: current.id })
      setDeleteProgress({ value: 95, stage: text.updatingList })
      await emit("environments-changed")
      setDeleteProgress({ value: 100, stage: text.environmentDeleted })
      await onSaved(current.id)
      onBack()
    } catch (error) {
      setMessage(errorMessage(error))
      setDeleteProgress(null)
      setBusy(false)
    }
  }
  async function operate(action: "start" | "stop" | "restart" | "rebuild") {
    if (!id) return
    setBusy(true)
    setMessage("")
    setProgress({ id, progress: 0, stage: action, indeterminate: false })
    try {
      await invoke("operate_environment", { id, action })
      await inspect()
      await emit("environments-changed")
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  async function operateService(service: string, action: "start" | "stop" | "restart") {
    if (!id) return
    setBusy(true)
    setMessage("")
    try {
      await invoke("operate_environment_service", { id, service, action })
      await inspect()
      await emit("environments-changed")
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  async function openService(service: string) {
    if (!id) return
    setBusy(true)
    setMessage("")
    setServiceOutput("")
    try {
      const configuration = await invoke<string>("environment_service_configuration", {
        id,
        service,
      })
      const containerName =
        inspection?.services.find((item) => item.name === service)?.containerName ?? service
      setServiceDialog({ name: service, containerName, configuration })
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  async function executeService() {
    if (!id || !serviceDialog || !serviceCommand.trim()) return
    setBusy(true)
    setServiceOutput("")
    try {
      const command = splitCommand(serviceCommand)
      const output = await invoke<string>("execute_environment_service_command", {
        id,
        service: serviceDialog.name,
        command,
      })
      setServiceOutput(output)
    } catch (error) {
      setServiceOutput(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  async function openPhpInfo() {
    if (!id || !draft) return
    setBusy(true)
    setMessage("")
    try {
      const output = await invoke<string>("execute_environment_service_command", {
        id,
        service: draft.webServer === "Nginx" ? "php" : "web",
        command: ["php", "-i"],
      })
      setPhpInfo(output)
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  async function openNodeScripts() {
    if (!id) return
    setBusy(true)
    setMessage("")
    try {
      const output = await invoke<string>("execute_environment_service_command", {
        id,
        service: "node",
        command: [
          "node",
          "-e",
          "const p=require('./package.json'); console.log(JSON.stringify(p.scripts||{},null,2))",
        ],
      })
      setNodeScripts(output)
      setNodeScriptOutput("")
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  async function runNodeScript(script: string) {
    if (!id || !draft || !nodeScriptEntries(nodeScripts).some(([name]) => name === script)) return
    setBusy(true)
    setNodeScriptOutput("")
    try {
      const output = await invoke<string>("execute_environment_service_command", {
        id,
        service: "node",
        command: [draft.nodePackageManager, "run", script],
      })
      setNodeScriptOutput(output || text.scriptCompleted(script))
    } catch (error) {
      setNodeScriptOutput(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  async function clearServiceLogs() {
    if (!id || !serviceDialog) return
    setBusy(true)
    try {
      const output = await invoke<string>("clear_environment_service_logs", {
        id,
        service: serviceDialog.name,
      })
      setServiceOutput(output)
      await inspect()
    } catch (error) {
      setServiceOutput(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  async function openServiceUrl() {
    if (!id || !serviceDialog) return
    try {
      const url = await invoke<string>("environment_service_url", {
        id,
        service: serviceDialog.name,
      })
      await invoke("open_url", { url })
    } catch (error) {
      setServiceOutput(errorMessage(error))
    }
  }
  return (
    <div className="min-h-full bg-background">
      <div className="flex items-center gap-3 border-b px-4 py-3 lg:px-6">
        <Button variant="ghost" size="icon-sm" onClick={onBack}>
          <ArrowLeft />
        </Button>
        <div>
          <p className="text-sm font-medium">
            {id ? text.editEnvironment : text.createEnvironment}
          </p>
          <p className="text-xs text-muted-foreground">{draft.name}</p>
        </div>
      </div>
      <div className="p-4 lg:p-6">
        <div className="mx-auto grid max-w-5xl gap-4">
          {(id || progress) && (
            <Card>
              <CardHeader className="flex-row items-center">
                <div>
                  <CardTitle>{text.environmentStatus}</CardTitle>
                  <CardDescription>
                    {draft.runtimeMode === "native"
                      ? text.nativeRuntimeDescription
                      : (runtime?.message ?? text.checkingRuntime)}
                  </CardDescription>
                </div>
                <Badge
                  className="ml-auto"
                  variant={inspection?.status === "running" ? "default" : "secondary"}
                >
                  {inspection?.status ?? text.checking}
                </Badge>
              </CardHeader>
              <CardContent className="grid gap-4">
                {id && (
                  <ButtonGroup>
                    {inspection?.status === "running" ? (
                      <>
                        <Button variant="outline" disabled={busy} onClick={() => operate("stop")}>
                          <Square />
                          {text.stop}
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => operate("restart")}
                        >
                          <RotateCw />
                          {text.restart}
                        </Button>
                      </>
                    ) : (
                      <Button
                        disabled={
                          busy ||
                          (draft.runtimeMode !== "native" &&
                            (!runtime?.running || !runtime?.composeAvailable))
                        }
                        onClick={() => operate("start")}
                      >
                        <Play />
                        {text.start}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      disabled={
                        busy || (draft.runtimeMode !== "native" && !runtime?.composeAvailable)
                      }
                      onClick={() => operate("rebuild")}
                    >
                      <RefreshCw />
                      {text.rebuild}
                    </Button>
                    <Button variant="outline" disabled={busy} onClick={inspect}>
                      <RefreshCw />
                      {text.refreshStatus}
                    </Button>
                  </ButtonGroup>
                )}
                {progress && (
                  <div className="grid gap-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{text.actionLabels[progress.stage] ?? progress.stage}</span>
                      <span>{progress.indeterminate ? text.working : `${progress.progress}%`}</span>
                    </div>
                    <Progress value={progress.progress} />
                  </div>
                )}
                {inspection?.services?.length ? (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {inspection.services.map((service) => (
                      <div key={service.name} className="grid gap-3 rounded-lg border p-3 text-sm">
                        <div className="flex min-w-0 items-center justify-between gap-2">
                          <span className="truncate font-medium">{service.name}</span>
                          <Badge
                            className="shrink-0"
                            variant={service.state === "running" ? "default" : "secondary"}
                          >
                            {(service.health || service.state).split(" · CPU ")[0]}
                          </Badge>
                        </div>
                        <ButtonGroup className="w-full">
                          {service.state === "running" ? (
                            <Button
                              className="flex-1"
                              variant="outline"
                              size="xs"
                              disabled={busy}
                              onClick={() => operateService(service.name, "stop")}
                            >
                              <Square />
                              {text.stop}
                            </Button>
                          ) : (
                            <Button
                              className="flex-1"
                              variant="outline"
                              size="xs"
                              disabled={busy}
                              onClick={() => operateService(service.name, "start")}
                            >
                              <Play />
                              {text.start}
                            </Button>
                          )}
                          <Button
                            className="flex-1"
                            variant="outline"
                            size="xs"
                            disabled={busy}
                            onClick={() => operateService(service.name, "restart")}
                          >
                            <RotateCw />
                            {text.restart}
                          </Button>
                        </ButtonGroup>
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}
          {inspection?.services?.some((service) => service.cpu || service.memory) && (
            <Card>
              <CardHeader>
                <CardTitle>{text.resourceUsage}</CardTitle>
                <CardDescription>{text.resourceUsageDescription}</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{text.serviceColumn}</TableHead>
                      <TableHead>{text.cpuColumn}</TableHead>
                      <TableHead>{text.memoryColumn}</TableHead>
                      <TableHead>{text.networkIoColumn}</TableHead>
                      <TableHead>{text.blockIoColumn}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inspection.services.map((service) => (
                      <TableRow key={service.name}>
                        <TableCell className="font-medium">{service.name}</TableCell>
                        <TableCell>{service.cpu || "—"}</TableCell>
                        <TableCell>{service.memory || "—"}</TableCell>
                        <TableCell>{service.networkIo || "—"}</TableCell>
                        <TableCell>{service.blockIo || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>{text.containerEnvironment}</CardTitle>
              <CardDescription>{text.containerEnvironmentDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              {draft.runtimeMode === "native" ? (
                <div className="grid gap-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={text.environmentNameLabel}>
                      <Input value={draft.name} onChange={(e) => update("name", e.target.value)} />
                    </Field>
                    <Field label={text.internalPortLabel}>
                      <Input value={draft.port} onChange={(e) => update("port", e.target.value)} />
                    </Field>
                  </div>
                  {draft.extraServices.includes("node") && (
                    <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                      <Field label={text.nodeVersionLabel}>
                        <Input
                          value={draft.nodeVersion}
                          onChange={(e) => update("nodeVersion", e.target.value)}
                        />
                      </Field>
                      <Field label={text.packageManagerLabel}>
                        <Choice
                          value={draft.nodePackageManager}
                          values={["npm", "pnpm", "yarn"]}
                          onChange={(value) => update("nodePackageManager", value)}
                        />
                      </Field>
                      <Field label={text.activeRunCommandLabel}>
                        <Choice
                          value={draft.nodeRunMode}
                          values={["dev", "start"]}
                          onChange={(value) => update("nodeRunMode", value)}
                        />
                      </Field>
                      <Field label={text.devCommandLabel}>
                        <Input
                          value={draft.nodeDevCommand}
                          onChange={(e) => update("nodeDevCommand", e.target.value)}
                        />
                      </Field>
                      <Field label={text.buildCommandLabel}>
                        <Input
                          value={draft.nodeBuildCommand}
                          onChange={(e) => update("nodeBuildCommand", e.target.value)}
                        />
                      </Field>
                      <Field label={text.startCommandLabel}>
                        <Input
                          value={draft.nodeStartCommand}
                          onChange={(e) => update("nodeStartCommand", e.target.value)}
                        />
                      </Field>
                      <CheckRow
                        label={text.installDepsAutomatically}
                        checked={draft.nodeAutoInstall}
                        onChange={(value) => update("nodeAutoInstall", value)}
                      />
                      <CheckRow
                        label={text.restartNodeAutomatically}
                        checked={draft.nodeAutoRestart}
                        onChange={(value) => update("nodeAutoRestart", value)}
                      />
                    </div>
                  )}
                  <div className="grid gap-2">
                    <Label>{text.environmentVariablesLabel}</Label>
                    <Textarea
                      className="min-h-40 font-mono"
                      value={variables}
                      onChange={(event) => setVariables(event.target.value)}
                      placeholder={"API_KEY=xxxx"}
                    />
                    <p className="text-xs text-muted-foreground">{text.environmentVariablesHint}</p>
                  </div>
                  {id && <NativeProcessLogs environmentId={id} language={language} />}
                </div>
              ) : (
                <Tabs defaultValue="general">
                  <TabsList className="grid h-auto w-full grid-cols-4 gap-1 sm:grid-cols-8">
                    <TabsTrigger value="general">{text.tabGeneral}</TabsTrigger>
                    <TabsTrigger value="php">{text.tabPhp}</TabsTrigger>
                    <TabsTrigger value="database">{text.tabDatabase}</TabsTrigger>
                    <TabsTrigger value="services">{text.tabServices}</TabsTrigger>
                    <TabsTrigger value="variables">{text.tabVariables}</TabsTrigger>
                    <TabsTrigger value="runtime">{text.tabRuntime}</TabsTrigger>
                    <TabsTrigger value="infrastructure">{text.tabInfrastructure}</TabsTrigger>
                    <TabsTrigger value="logs">{text.tabLogs}</TabsTrigger>
                  </TabsList>
                  <TabsContent value="general" className="grid gap-4 pt-5">
                    <Field label={text.environmentNameLabel}>
                      <Input value={draft.name} onChange={(e) => update("name", e.target.value)} />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={text.webServerLabel}>
                        <Choice
                          value={draft.webServer}
                          values={["Nginx", "Apache"]}
                          onChange={(value) =>
                            setDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    webServer: value,
                                    webVersion: WEB_SERVER_VERSIONS[value]?.[0] ?? "2.4",
                                  }
                                : current,
                            )
                          }
                        />
                      </Field>
                      <Field label={text.webServerVersionLabel}>
                        {WEB_SERVER_VERSIONS[draft.webServer] ? (
                          <Choice
                            value={draft.webVersion}
                            values={WEB_SERVER_VERSIONS[draft.webServer]}
                            onChange={(value) => update("webVersion", value)}
                          />
                        ) : (
                          <p className="pt-2 text-sm text-muted-foreground">
                            {text.bundledWithPhpImage}
                          </p>
                        )}
                      </Field>
                      <Field label={text.webContainerNameLabel}>
                        <Input
                          value={draft.webContainerName}
                          placeholder={`${draft.name}-web`}
                          onChange={(e) => update("webContainerName", e.target.value)}
                        />
                      </Field>
                      <Field label={text.internalPortLabel}>
                        <Input
                          value={draft.port}
                          onChange={(e) => update("port", e.target.value)}
                        />
                      </Field>
                    </div>
                  </TabsContent>
                  <TabsContent value="php" className="grid gap-5 pt-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={text.phpVersionLabel}>
                        <Choice
                          value={draft.phpVersion}
                          values={[...PHP_VERSIONS]}
                          onChange={(value) => update("phpVersion", value)}
                        />
                      </Field>
                      <Field label={text.composerVersionLabel}>
                        <Choice
                          value={draft.composerVersion}
                          values={["2", "2.8", "2.7"]}
                          onChange={(value) => update("composerVersion", value)}
                        />
                      </Field>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-4">
                      <Field label="memory_limit">
                        <Input
                          value={draft.phpMemoryLimit}
                          onChange={(e) => update("phpMemoryLimit", e.target.value)}
                        />
                      </Field>
                      <Field label="upload_max">
                        <Input
                          value={draft.phpUploadLimit}
                          onChange={(e) => update("phpUploadLimit", e.target.value)}
                        />
                      </Field>
                      <Field label="post_max">
                        <Input
                          value={draft.phpPostLimit}
                          onChange={(e) => update("phpPostLimit", e.target.value)}
                        />
                      </Field>
                      <Field label="execution time">
                        <Input
                          type="number"
                          value={draft.phpExecutionTime}
                          onChange={(e) => update("phpExecutionTime", Number(e.target.value))}
                        />
                      </Field>
                    </div>
                    <CheckGrid
                      title={text.phpExtensionsTitle}
                      values={[...PHP_EXTENSIONS]}
                      selected={draft.phpExtensions}
                      onToggle={(value) => toggle("phpExtensions", value)}
                    />
                    <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
                      <CheckRow
                        label={text.enablePhpJit}
                        checked={draft.phpJit}
                        onChange={(checked) => {
                          update("phpJit", checked)
                          if (checked && !draft.phpExtensions.includes("opcache"))
                            update("phpExtensions", [...draft.phpExtensions, "opcache"])
                        }}
                      />
                      <Field label={text.jitModeLabel}>
                        <Choice
                          value={draft.phpJitMode}
                          values={["tracing", "function"]}
                          onChange={(value) => update("phpJitMode", value)}
                        />
                      </Field>
                      <Field label={text.jitBufferSizeLabel}>
                        <Input
                          value={draft.phpJitBufferSize}
                          onChange={(event) => update("phpJitBufferSize", event.target.value)}
                        />
                      </Field>
                    </div>
                    <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
                      <CheckRow
                        label={text.enableXdebug}
                        checked={draft.phpXdebug}
                        onChange={(checked) => {
                          update("phpXdebug", checked)
                          if (checked && !draft.phpExtensions.includes("xdebug"))
                            update("phpExtensions", [...draft.phpExtensions, "xdebug"])
                        }}
                      />
                      <Field label={text.xdebugModeLabel}>
                        <Choice
                          value={draft.phpXdebugMode}
                          values={["debug", "develop,debug", "debug,coverage"]}
                          onChange={(value) => update("phpXdebugMode", value)}
                        />
                      </Field>
                      <Field label={text.startWithRequestLabel}>
                        <Choice
                          value={draft.phpXdebugStart}
                          values={["trigger", "yes", "no"]}
                          onChange={(value) => update("phpXdebugStart", value)}
                        />
                      </Field>
                      <NumberField
                        label={text.debugPortLabel}
                        value={draft.phpXdebugPort}
                        onChange={(value) => update("phpXdebugPort", value)}
                      />
                      <Field label={text.ideKeyLabel}>
                        <Input
                          value={draft.phpXdebugIdeKey}
                          onChange={(event) => update("phpXdebugIdeKey", event.target.value)}
                        />
                      </Field>
                      <Field label={text.ideLabel}>
                        <Choice
                          value={xdebugIde}
                          values={["VS Code", "PhpStorm"]}
                          onChange={setXdebugIde}
                        />
                      </Field>
                      <Button
                        variant="outline"
                        disabled={!draft.phpXdebug}
                        onClick={() => setXdebugConfigOpen(true)}
                      >
                        <Copy />
                        {text.generateIdeConfig}
                      </Button>
                    </div>
                    <Dialog open={xdebugConfigOpen} onOpenChange={setXdebugConfigOpen}>
                      <DialogContent className="sm:max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>{text.xdebugConfigTitle(xdebugIde)}</DialogTitle>
                          <DialogDescription>{text.xdebugConfigDescription}</DialogDescription>
                        </DialogHeader>
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              void navigator.clipboard.writeText(
                                xdebugIdeConfiguration(xdebugIde, draft),
                              )
                            }
                          >
                            <Copy />
                            {text.copy}
                          </Button>
                        </div>
                        <pre className="max-h-[60vh] overflow-auto rounded-lg border bg-muted/30 p-4 text-xs whitespace-pre-wrap">
                          {xdebugIdeConfiguration(xdebugIde, draft)}
                        </pre>
                      </DialogContent>
                    </Dialog>
                    <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                      <CheckRow
                        label={text.enablePhpCron}
                        checked={draft.phpCron}
                        onChange={(checked) => update("phpCron", checked)}
                      />
                      <div />
                      <Field label={text.cronScheduleLabel}>
                        <Input
                          value={draft.phpCronSchedule}
                          disabled={!draft.phpCron}
                          placeholder="* * * * *"
                          onChange={(event) => update("phpCronSchedule", event.target.value)}
                        />
                      </Field>
                      <Field label={text.commandLabel}>
                        <Input
                          value={draft.phpCronCommand}
                          disabled={!draft.phpCron}
                          onChange={(event) => update("phpCronCommand", event.target.value)}
                        />
                      </Field>
                    </div>
                    <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                      <CheckRow
                        label={text.enableBackupSchedule}
                        checked={draft.backupScheduleEnabled}
                        onChange={(checked) => update("backupScheduleEnabled", checked)}
                      />
                      <div />
                      <Field label={text.backupIntervalLabel}>
                        <Choice
                          value={String(draft.backupScheduleIntervalHours)}
                          values={["1", "6", "12", "24", "168"]}
                          onChange={(value) => update("backupScheduleIntervalHours", Number(value))}
                        />
                      </Field>
                      <NumberField
                        label={text.backupRetentionLabel}
                        value={draft.backupRetentionCount}
                        onChange={(value) => update("backupRetentionCount", value)}
                      />
                    </div>
                    {draft.webServer === "Nginx" && (
                      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
                        <Field label={text.phpFpmManagerLabel}>
                          <Choice
                            value={draft.phpFpmProcessManager}
                            values={["dynamic", "ondemand", "static"]}
                            onChange={(value) => update("phpFpmProcessManager", value)}
                          />
                        </Field>
                        <NumberField
                          label={text.maxChildrenLabel}
                          value={draft.phpFpmMaxChildren}
                          onChange={(value) => update("phpFpmMaxChildren", value)}
                        />
                        <NumberField
                          label={text.maxRequestsLabel}
                          value={draft.phpFpmMaxRequests}
                          onChange={(value) => update("phpFpmMaxRequests", value)}
                        />
                        {draft.phpFpmProcessManager === "dynamic" && (
                          <>
                            <NumberField
                              label={text.startServersLabel}
                              value={draft.phpFpmStartServers}
                              onChange={(value) => update("phpFpmStartServers", value)}
                            />
                            <NumberField
                              label={text.minSpareServersLabel}
                              value={draft.phpFpmMinSpareServers}
                              onChange={(value) => update("phpFpmMinSpareServers", value)}
                            />
                            <NumberField
                              label={text.maxSpareServersLabel}
                              value={draft.phpFpmMaxSpareServers}
                              onChange={(value) => update("phpFpmMaxSpareServers", value)}
                            />
                          </>
                        )}
                      </div>
                    )}
                    {id && (
                      <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                        <div>
                          <p className="text-sm font-medium">{text.phpInformationTitle}</p>
                          <p className="text-xs text-muted-foreground">
                            {text.phpInformationDescription}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => void openPhpInfo()}
                        >
                          <Eye />
                          {text.viewPhpInfo}
                        </Button>
                      </div>
                    )}
                    <Dialog
                      open={phpInfo !== null}
                      onOpenChange={(open) => !open && setPhpInfo(null)}
                    >
                      <DialogContent className="sm:max-w-4xl">
                        <DialogHeader>
                          <DialogTitle>{text.phpInfoDialogTitle}</DialogTitle>
                          <DialogDescription>{text.phpInfoDialogDescription}</DialogDescription>
                        </DialogHeader>
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void navigator.clipboard.writeText(phpInfo ?? "")}
                          >
                            <Copy />
                            {text.copy}
                          </Button>
                        </div>
                        <pre className="max-h-[65vh] overflow-auto rounded-lg border bg-muted/30 p-4 text-xs whitespace-pre-wrap">
                          {phpInfo}
                        </pre>
                      </DialogContent>
                    </Dialog>
                  </TabsContent>
                  <TabsContent value="database" className="grid gap-4 pt-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={text.engineLabel}>
                        <Choice
                          value={draft.database}
                          values={["MySQL", "MariaDB", "PostgreSQL"]}
                          onChange={(value) =>
                            setDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    database: value,
                                    databaseVersion: defaultDatabaseVersion(value),
                                  }
                                : current,
                            )
                          }
                        />
                      </Field>
                      <Field label={text.versionLabel}>
                        <Choice
                          value={draft.databaseVersion}
                          values={DATABASE_VERSIONS[draft.database] ?? []}
                          onChange={(value) => update("databaseVersion", value)}
                        />
                      </Field>
                      <Field label={text.containerNameLabel}>
                        <Input
                          value={draft.databaseContainerName}
                          placeholder={`${draft.name}-database`}
                          onChange={(e) => update("databaseContainerName", e.target.value)}
                        />
                      </Field>
                      <Field label={text.databaseLabel}>
                        <Input
                          value={draft.databaseName}
                          onChange={(e) => update("databaseName", e.target.value)}
                        />
                      </Field>
                      <Field label={text.userLabel}>
                        <Input
                          value={draft.databaseUser}
                          onChange={(e) => update("databaseUser", e.target.value)}
                        />
                      </Field>
                      <Field label={text.passwordLabel}>
                        <SecretInput
                          value={draft.databasePassword}
                          language={language}
                          onChange={(value) => update("databasePassword", value)}
                        />
                      </Field>
                      <Field label={text.rootPasswordLabel}>
                        <SecretInput
                          value={draft.databaseRootPassword}
                          language={language}
                          onChange={(value) => update("databaseRootPassword", value)}
                        />
                      </Field>
                    </div>
                  </TabsContent>
                  <TabsContent value="services" className="grid gap-5 pt-5">
                    <CheckGrid
                      title={text.additionalServicesTitle}
                      values={services}
                      selected={draft.extraServices}
                      onToggle={(value) => toggle("extraServices", value)}
                    />
                    {draft.extraServices.includes("node") && (
                      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                        <Field label={text.nodeVersionLabel}>
                          <Input
                            value={draft.nodeVersion}
                            onChange={(e) => update("nodeVersion", e.target.value)}
                          />
                        </Field>
                        <Field label={text.packageManagerLabel}>
                          <Choice
                            value={draft.nodePackageManager}
                            values={["npm", "pnpm", "yarn"]}
                            onChange={(value) => update("nodePackageManager", value)}
                          />
                        </Field>
                        <Field label={text.activeRunCommandLabel}>
                          <Choice
                            value={draft.nodeRunMode}
                            values={["dev", "start"]}
                            onChange={(value) => update("nodeRunMode", value)}
                          />
                        </Field>
                        <Field label={text.devCommandLabel}>
                          <Input
                            value={draft.nodeDevCommand}
                            onChange={(e) => update("nodeDevCommand", e.target.value)}
                          />
                        </Field>
                        <Field label={text.buildCommandLabel}>
                          <Input
                            value={draft.nodeBuildCommand}
                            onChange={(e) => update("nodeBuildCommand", e.target.value)}
                          />
                        </Field>
                        <Field label={text.startCommandLabel}>
                          <Input
                            value={draft.nodeStartCommand}
                            onChange={(e) => update("nodeStartCommand", e.target.value)}
                          />
                        </Field>
                        <CheckRow
                          label={text.installDepsAutomatically}
                          checked={draft.nodeAutoInstall}
                          onChange={(value) => update("nodeAutoInstall", value)}
                        />
                        <CheckRow
                          label={text.restartNodeAutomatically}
                          checked={draft.nodeAutoRestart}
                          onChange={(value) => update("nodeAutoRestart", value)}
                        />
                        <CheckRow
                          label={text.enableNodeInspector}
                          checked={draft.nodeInspector}
                          onChange={(value) => update("nodeInspector", value)}
                        />
                        <NumberField
                          label={text.inspectorPortLabel}
                          value={draft.nodeInspectorPort}
                          onChange={(value) => update("nodeInspectorPort", value)}
                        />
                        <Button
                          variant="outline"
                          disabled={!draft.nodeInspector}
                          onClick={() => setNodeInspectorConfigOpen(true)}
                        >
                          <Copy />
                          {text.generateVsCodeConfig}
                        </Button>
                        {id && (
                          <Button
                            variant="outline"
                            disabled={!draft.nodeInspector || busy}
                            onClick={() =>
                              void invoke("open_url", {
                                url: `http://127.0.0.1:${draft.nodeInspectorPort}/json/list`,
                              }).catch((error) => setMessage(errorMessage(error)))
                            }
                          >
                            <Eye />
                            {text.openInspectorEndpoint}
                          </Button>
                        )}
                        {id && (
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => void openNodeScripts()}
                          >
                            <Eye />
                            {text.viewPackageScripts}
                          </Button>
                        )}
                      </div>
                    )}
                    <Dialog
                      open={nodeInspectorConfigOpen}
                      onOpenChange={setNodeInspectorConfigOpen}
                    >
                      <DialogContent className="sm:max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>{text.vsCodeInspectorConfigTitle}</DialogTitle>
                          <DialogDescription>
                            {text.vsCodeInspectorConfigDescription}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              void navigator.clipboard.writeText(
                                nodeInspectorConfiguration(draft.nodeInspectorPort),
                              )
                            }
                          >
                            <Copy />
                            {text.copy}
                          </Button>
                        </div>
                        <pre className="max-h-[60vh] overflow-auto rounded-lg border bg-muted/30 p-4 text-xs whitespace-pre-wrap">
                          {nodeInspectorConfiguration(draft.nodeInspectorPort)}
                        </pre>
                      </DialogContent>
                    </Dialog>
                    <Dialog
                      open={nodeScripts !== null}
                      onOpenChange={(open) => {
                        if (!open) {
                          setNodeScripts(null)
                          setNodeScriptOutput("")
                        }
                      }}
                    >
                      <DialogContent className="sm:max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>{text.packageJsonScriptsTitle}</DialogTitle>
                          <DialogDescription>
                            {text.packageJsonScriptsDescription}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void navigator.clipboard.writeText(nodeScripts ?? "")}
                          >
                            <Copy />
                            {text.copy}
                          </Button>
                        </div>
                        <div className="grid max-h-[60vh] gap-2 overflow-auto">
                          {nodeScriptEntries(nodeScripts).map(([name, command]) => (
                            <div
                              key={name}
                              className="flex items-center justify-between gap-3 rounded-lg border p-3"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium">{name}</p>
                                <code className="block truncate text-xs text-muted-foreground">
                                  {command}
                                </code>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => void runNodeScript(name)}
                              >
                                <Play />
                                {text.run}
                              </Button>
                            </div>
                          ))}
                          {nodeScriptEntries(nodeScripts).length === 0 && (
                            <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                              {text.noPackageScriptsFound}
                            </p>
                          )}
                        </div>
                        {nodeScriptOutput && (
                          <pre className="max-h-48 overflow-auto rounded-lg border bg-muted/30 p-4 text-xs whitespace-pre-wrap">
                            {nodeScriptOutput}
                          </pre>
                        )}
                      </DialogContent>
                    </Dialog>
                    {draft.extraServices.includes("redis") && (
                      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                        <Field label={text.redisVersionLabel}>
                          <Input
                            value={draft.redisVersion}
                            onChange={(e) => update("redisVersion", e.target.value)}
                          />
                        </Field>
                        <Field label={text.passwordLabel}>
                          <Input
                            type="password"
                            value={draft.redisPassword}
                            onChange={(e) => update("redisPassword", e.target.value)}
                          />
                        </Field>
                        <Field label={text.memoryLabel}>
                          <Input
                            value={draft.redisMemoryLimit}
                            onChange={(e) => update("redisMemoryLimit", e.target.value)}
                          />
                        </Field>
                        <Field label={text.evictionPolicyLabel}>
                          <Choice
                            value={draft.redisEvictionPolicy}
                            values={[
                              "noeviction",
                              "allkeys-lru",
                              "allkeys-lfu",
                              "volatile-lru",
                              "volatile-ttl",
                            ]}
                            onChange={(value) => update("redisEvictionPolicy", value)}
                          />
                        </Field>
                      </div>
                    )}
                    {draft.extraServices.includes("elasticsearch") && (
                      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                        <Field label={text.elasticsearchVersionLabel}>
                          <Input
                            value={draft.elasticsearchVersion}
                            onChange={(e) => update("elasticsearchVersion", e.target.value)}
                          />
                        </Field>
                        <Field label={text.memoryLabel}>
                          <Input
                            value={draft.elasticsearchMemoryLimit}
                            onChange={(e) => update("elasticsearchMemoryLimit", e.target.value)}
                          />
                        </Field>
                      </div>
                    )}
                    {draft.extraServices.includes("minio") && (
                      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                        <Field label={text.minioVersionLabel}>
                          <Input
                            value={draft.minioVersion}
                            onChange={(e) => update("minioVersion", e.target.value)}
                          />
                        </Field>
                        <Field label={text.minioRootUserLabel}>
                          <Input
                            value={draft.minioRootUser}
                            onChange={(e) => update("minioRootUser", e.target.value)}
                          />
                        </Field>
                        <Field label={text.passwordLabel}>
                          <Input
                            type="password"
                            value={draft.minioRootPassword}
                            onChange={(e) => update("minioRootPassword", e.target.value)}
                          />
                        </Field>
                      </div>
                    )}
                    {draft.extraServices.includes("rabbitmq") && (
                      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                        <Field label={text.rabbitmqVersionLabel}>
                          <Input
                            value={draft.rabbitmqVersion}
                            onChange={(e) => update("rabbitmqVersion", e.target.value)}
                          />
                        </Field>
                        <Field label={text.rabbitmqUserLabel}>
                          <Input
                            value={draft.rabbitmqUser}
                            onChange={(e) => update("rabbitmqUser", e.target.value)}
                          />
                        </Field>
                        <Field label={text.passwordLabel}>
                          <Input
                            type="password"
                            value={draft.rabbitmqPassword}
                            onChange={(e) => update("rabbitmqPassword", e.target.value)}
                          />
                        </Field>
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="variables" className="grid gap-2 pt-5">
                    <Label>{text.environmentVariablesLabel}</Label>
                    <Textarea
                      className="min-h-64 font-mono"
                      value={variables}
                      onChange={(event) => setVariables(event.target.value)}
                      placeholder={"APP_ENV=local\nDEBUG=true"}
                    />
                    <p className="text-xs text-muted-foreground">{text.environmentVariablesHint}</p>
                  </TabsContent>
                  <TabsContent value="runtime" className="grid gap-4 pt-5">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field label={text.restartPolicyLabel}>
                        <Choice
                          value={draft.restartPolicy}
                          values={["no", "always", "unless-stopped", "on-failure"]}
                          onChange={(value) => update("restartPolicy", value)}
                        />
                      </Field>
                      <Field label={text.cpuLimitLabel}>
                        <Input
                          value={draft.cpuLimit}
                          onChange={(e) => update("cpuLimit", e.target.value)}
                        />
                      </Field>
                      <Field label={text.memoryLimitLabel}>
                        <Input
                          value={draft.containerMemoryLimit}
                          onChange={(e) => update("containerMemoryLimit", e.target.value)}
                        />
                      </Field>
                    </div>
                    {id && inspection?.services?.length ? (
                      <Card>
                        <CardHeader>
                          <CardTitle>{text.serviceToolsTitle}</CardTitle>
                          <CardDescription>{text.serviceToolsDescription}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-wrap gap-2">
                          {inspection.services.map((service) => (
                            <Button
                              key={service.name}
                              variant="outline"
                              disabled={busy}
                              onClick={() => void openService(service.name)}
                            >
                              <Settings2 />
                              {service.name}
                            </Button>
                          ))}
                        </CardContent>
                      </Card>
                    ) : null}
                    <Dialog
                      open={Boolean(serviceDialog)}
                      onOpenChange={(open) => {
                        if (!open) {
                          setServiceDialog(null)
                          setServiceCommand("")
                          setServiceOutput("")
                        }
                      }}
                    >
                      <DialogContent className="sm:max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>
                            {text.serviceDialogTitle(serviceDialog?.name ?? "")}
                          </DialogTitle>
                          <DialogDescription>
                            {text.serviceDialogDescription(serviceDialog?.containerName ?? "")}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid max-h-[65vh] gap-4 overflow-auto">
                          <div className="grid gap-2">
                            <div className="flex items-center justify-between">
                              <Label>{text.configurationLabel}</Label>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  void navigator.clipboard.writeText(
                                    serviceDialog?.configuration ?? "",
                                  )
                                }
                              >
                                <Copy />
                                {text.copy}
                              </Button>
                            </div>
                            <Textarea
                              readOnly
                              className="min-h-48 font-mono text-xs"
                              value={serviceDialog?.configuration ?? ""}
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label>{text.containerActionsLabel}</Label>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                onClick={() =>
                                  void navigator.clipboard.writeText(
                                    serviceDialog?.containerName ?? "",
                                  )
                                }
                              >
                                <Copy />
                                {text.copyContainerName}
                              </Button>
                              <Button variant="outline" onClick={() => void openServiceUrl()}>
                                {text.openInBrowser}
                              </Button>
                              <Button
                                variant="destructive"
                                disabled={busy}
                                onClick={() => void clearServiceLogs()}
                              >
                                <Trash2 />
                                {text.clearLogs}
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">{text.clearingLogsHint}</p>
                          </div>
                          <div className="grid gap-2">
                            <Label>{text.executeCommandLabel}</Label>
                            <div className="flex gap-2">
                              <Input
                                className="font-mono"
                                value={serviceCommand}
                                onChange={(event) => setServiceCommand(event.target.value)}
                                placeholder="php -v"
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") void executeService()
                                }}
                              />
                              <Button
                                disabled={busy || !serviceCommand.trim()}
                                onClick={() => void executeService()}
                              >
                                <TerminalSquare />
                                {text.run}
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {text.executeCommandHint}
                            </p>
                          </div>
                          {serviceOutput && (
                            <Textarea
                              readOnly
                              className="min-h-32 font-mono text-xs"
                              value={serviceOutput}
                            />
                          )}
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setServiceDialog(null)}>
                            {text.closeLabel}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </TabsContent>
                  <TabsContent value="infrastructure" className="grid gap-2 pt-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>{text.portsVolumesNetworksLabel}</Label>
                        <p className="text-xs text-muted-foreground">{text.infrastructureHint}</p>
                      </div>
                      <Button variant="outline" size="sm" disabled={busy} onClick={inspect}>
                        <RefreshCw />
                        {text.refresh}
                      </Button>
                    </div>
                    <Textarea readOnly className="min-h-96 font-mono text-xs" value={topology} />
                  </TabsContent>
                  <TabsContent value="logs" className="grid gap-2 pt-5">
                    <div className="flex items-center justify-between">
                      <Label>{text.recentLogsLabel}</Label>
                      <Button variant="outline" size="sm" disabled={busy} onClick={inspect}>
                        <RefreshCw />
                        {text.refresh}
                      </Button>
                    </div>
                    {inspection?.logs ? (
                      <Textarea
                        readOnly
                        className="min-h-[420px] font-mono text-xs"
                        value={inspection.logs}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">{text.noLogsAvailable}</p>
                    )}
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
          {message && (
            <Alert variant={messageOk ? "default" : "destructive"}>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          <div className="flex justify-between">
            <AlertDialog
              open={deleteOpen}
              onOpenChange={(open) => {
                if (!busy) setDeleteOpen(open)
              }}
            >
              <AlertDialogTrigger render={<Button variant="destructive" disabled={busy || !id} />}>
                <Trash2 />
                {text.deleteLabel}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {deleteProgress
                      ? text.deletingEnvironment
                      : text.deleteEnvironmentTitle(draft.name)}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {deleteProgress ? text.keepOpenHint : text.deleteEnvironmentDescription}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {deleteProgress && (
                  <div className="grid gap-2 py-2">
                    <div className="flex items-center justify-between gap-4 text-sm">
                      <span>{deleteProgress.stage}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {deleteProgress.value}%
                      </span>
                    </div>
                    <Progress value={deleteProgress.value} />
                  </div>
                )}
                <AlertDialogFooter>
                  {!deleteProgress && (
                    <AlertDialogCancel disabled={busy}>{text.cancel}</AlertDialogCancel>
                  )}
                  <AlertDialogAction
                    variant="destructive"
                    disabled={busy}
                    onClick={(event) => {
                      event.preventDefault()
                      void remove()
                    }}
                  >
                    {deleteProgress ? (
                      text.deleting
                    ) : (
                      <>
                        <Trash2 />
                        {text.deleteEnvironment}
                      </>
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button disabled={busy || !draft.name} onClick={save}>
              <Save />
              {busy ? text.saving : text.saveEnvironment}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function NativeProcessLogs({
  environmentId,
  language,
}: {
  environmentId: string
  language: string
}) {
  const text = pickLanguage(language).environmentWindow
  const [lines, setLines] = React.useState<string[]>([])
  const [paused, setPaused] = React.useState(false)
  const pausedRef = React.useRef(false)
  const viewport = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    pausedRef.current = paused
  }, [paused])
  React.useEffect(() => {
    let streamId = ""
    let disposed = false
    let cleanup = () => {}
    const start = async () => {
      setLines([])
      const unlisten = await listen<{
        streamId: string
        environmentId: string
        source: string
        line: string
      }>("environment-log-line", (event) => {
        if (
          event.payload.environmentId !== environmentId ||
          event.payload.streamId !== streamId ||
          pausedRef.current
        )
          return
        setLines((current) => [...current.slice(-1999), event.payload.line])
      })
      try {
        streamId = await invoke<string>("start_environment_log_stream", {
          environmentId,
          service: null,
        })
      } catch {
        unlisten()
        return
      }
      if (disposed) {
        unlisten()
        return
      }
      cleanup = () => unlisten()
    }
    void start()
    return () => {
      disposed = true
      cleanup()
    }
  }, [environmentId])
  React.useEffect(() => {
    if (viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight
  }, [lines])
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label>{text.recentLogsLabel}</Label>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPaused((current) => !current)}>
            {paused ? text.resume : text.pause}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setLines([])}>
            {text.clearView}
          </Button>
        </div>
      </div>
      <div
        ref={viewport}
        className="h-96 overflow-auto rounded-lg border bg-zinc-950 p-3 font-mono text-xs leading-5 text-zinc-200"
      >
        <pre className="whitespace-pre-wrap break-all">
          {lines.length ? lines.join("\n") : text.waitingForOutput}
        </pre>
      </div>
    </div>
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

function SecretInput({
  value,
  language,
  onChange,
}: {
  value: string
  language: string
  onChange: (value: string) => void
}) {
  const text = pickLanguage(language).environmentWindow
  const [visible, setVisible] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  return (
    <div className="flex gap-2">
      <Input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        title={visible ? text.hidePassword : text.showPassword}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOff /> : <Eye />}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        title={copied ? text.copied : text.copyPassword}
        disabled={!value}
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
          })
        }}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
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
function NumberField({
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
function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(Boolean(value))} />
      {label}
    </label>
  )
}
function CheckGrid({
  title,
  values,
  selected,
  onToggle,
}: {
  title: string
  values: string[]
  selected: string[]
  onToggle: (value: string) => void
}) {
  return (
    <div className="grid gap-3">
      <Label>{title}</Label>
      <div className="grid gap-2 sm:grid-cols-3">
        {values.map((value) => (
          <CheckRow
            key={value}
            label={value}
            checked={selected.includes(value)}
            onChange={() => onToggle(value)}
          />
        ))}
      </div>
    </div>
  )
}

function splitCommand(value: string) {
  const result: string[] = []
  let current = ""
  let quote = ""
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (quote) {
      if (character === quote) {
        quote = ""
      } else if (character === "\\" && index + 1 < value.length) {
        current += value[++index]
      } else current += character
    } else if (character === '"' || character === "'") {
      quote = character
    } else if (/\s/.test(character)) {
      if (current) {
        result.push(current)
        current = ""
      }
    } else current += character
  }
  if (quote) throw new Error("Command contains an unclosed quote")
  if (current) result.push(current)
  if (!result.length) throw new Error("Enter a command")
  return result
}

function nodeScriptEntries(value: string | null): Array<[string, string]> {
  if (!value) return []
  try {
    const scripts = JSON.parse(value) as Record<string, unknown>
    return Object.entries(scripts).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    )
  } catch {
    return []
  }
}

function xdebugIdeConfiguration(ide: string, environment: Environment) {
  if (ide === "PhpStorm") {
    return [
      `Xdebug port: ${environment.phpXdebugPort}`,
      `IDE key: ${environment.phpXdebugIdeKey}`,
      "Server host: project .localhost domain",
      "Debugger: Xdebug",
      "Path mapping: /var/www/sites → parent directory containing your LS Panel projects",
      "Enable: PHP > Debug > Start Listening for PHP Debug Connections",
    ].join("\n")
  }
  return JSON.stringify(
    {
      version: "0.2.0",
      configurations: [
        {
          name: "Listen for LS Panel Xdebug",
          type: "php",
          request: "launch",
          port: environment.phpXdebugPort,
          pathMappings: { "/var/www/sites": "${workspaceFolder}/.." },
          xdebugSettings: { max_children: 128, max_data: 1024, max_depth: 5 },
        },
      ],
    },
    null,
    2,
  )
}

function nodeInspectorConfiguration(port: number) {
  return JSON.stringify(
    {
      version: "0.2.0",
      configurations: [
        {
          name: "Attach to LS Panel Node.js",
          type: "node",
          request: "attach",
          address: "127.0.0.1",
          port,
          restart: true,
          localRoot: "${workspaceFolder}",
          remoteRoot: "/var/www/sites/${workspaceFolderBasename}",
          skipFiles: ["<node_internals>/**"],
        },
      ],
    },
    null,
    2,
  )
}
