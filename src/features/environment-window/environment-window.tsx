import React from "react"
import { emit, listen } from "@tauri-apps/api/event"
import { invoke } from "@tauri-apps/api/core"
import { ArrowLeft, Save } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { errorMessage } from "@/lib/errors"
import { pickLanguage } from "@/i18n"
import { applyTheme } from "@/theme"
import type { AppSettings } from "@/welcome-screen"
import { WEB_SERVER_VERSIONS, defaultDatabaseVersion } from "@/lib/version-catalog"
import type { Environment } from "@/types"

import { defaults } from "./constants"
import { DeleteEnvironmentDialog } from "./components/delete-dialog"
import { EnvironmentStatusCard } from "./components/status-card"
import { NativeModeForm } from "./components/native-mode-form"
import { DatabaseTab } from "./components/tabs/database-tab"
import { GeneralTab } from "./components/tabs/general-tab"
import { InfrastructureTab } from "./components/tabs/infrastructure-tab"
import { LogsTab } from "./components/tabs/logs-tab"
import { PhpTab } from "./components/tabs/php-tab"
import { RuntimeTab } from "./components/tabs/runtime-tab"
import { ServicesTab } from "./components/tabs/services-tab"
import { VariablesTab } from "./components/tabs/variables-tab"
import type { Inspection, OperationProgress, Runtime } from "./types"

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
  const [topology, setTopology] = React.useState("")
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
  const handleWebServerChange = (value: string) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            webServer: value,
            webVersion: WEB_SERVER_VERSIONS[value]?.[0] ?? "2.4",
          }
        : current,
    )
  const handleDatabaseEngineChange = (value: string) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            database: value,
            databaseVersion: defaultDatabaseVersion(value),
          }
        : current,
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
          <EnvironmentStatusCard
            id={id}
            draft={draft}
            runtime={runtime}
            inspection={inspection}
            progress={progress}
            busy={busy}
            language={language}
            onOperate={(action) => void operate(action)}
            onOperateService={(service, action) => void operateService(service, action)}
            onRefresh={inspect}
          />
          <Card>
            <CardHeader>
              <CardTitle>{text.containerEnvironment}</CardTitle>
              <CardDescription>{text.containerEnvironmentDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              {draft.runtimeMode === "native" ? (
                <NativeModeForm
                  id={id}
                  draft={draft}
                  update={update}
                  variables={variables}
                  setVariables={setVariables}
                  language={language}
                />
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
                  <GeneralTab
                    draft={draft}
                    update={update}
                    onWebServerChange={handleWebServerChange}
                    language={language}
                  />
                  <PhpTab
                    draft={draft}
                    update={update}
                    toggle={toggle}
                    id={id}
                    busy={busy}
                    setBusy={setBusy}
                    setMessage={setMessage}
                    language={language}
                  />
                  <DatabaseTab
                    draft={draft}
                    update={update}
                    onDatabaseChange={handleDatabaseEngineChange}
                    language={language}
                  />
                  <ServicesTab
                    draft={draft}
                    update={update}
                    toggle={toggle}
                    id={id}
                    busy={busy}
                    setBusy={setBusy}
                    setMessage={setMessage}
                    language={language}
                  />
                  <VariablesTab
                    variables={variables}
                    setVariables={setVariables}
                    language={language}
                  />
                  <RuntimeTab
                    draft={draft}
                    update={update}
                    id={id}
                    busy={busy}
                    setBusy={setBusy}
                    setMessage={setMessage}
                    inspection={inspection}
                    inspect={inspect}
                    language={language}
                  />
                  <InfrastructureTab
                    topology={topology}
                    busy={busy}
                    onRefresh={inspect}
                    language={language}
                  />
                  <LogsTab
                    inspection={inspection}
                    busy={busy}
                    onRefresh={inspect}
                    language={language}
                  />
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
            <DeleteEnvironmentDialog
              id={id}
              name={draft.name}
              busy={busy}
              setBusy={setBusy}
              setMessage={setMessage}
              onSaved={onSaved}
              onBack={onBack}
              language={language}
            />
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
