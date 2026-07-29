import React from "react"
import { open } from "@tauri-apps/plugin-dialog"
import { invoke } from "@tauri-apps/api/core"
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FolderOpen,
  Globe2,
  HardDrive,
  Moon,
  RotateCw,
  Server,
  Wifi,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { applyTheme } from "@/theme"
import { homeDir, join } from "@tauri-apps/api/path"
import { pickLanguage } from "@/i18n"
import { welcomeScreenText } from "@/i18n/welcome-screen"
import { formatMetricBytes } from "@/lib/format"
import { errorMessage } from "@/lib/errors"
import type { Runtime } from "@/types"

export type AppSettings = {
  completed: boolean
  language: string
  sitesDirectory: string
  theme: string
  runtime: string
  compactSidebar: boolean
  reduceMotion: boolean
  confirmDestructive: boolean
  defaultWebServer: string
  defaultPhpVersion: string
  defaultNodeVersion: string
  defaultDatabase: string
  defaultDatabaseVersion: string
  autoInitGit: boolean
  autoStartProjects: boolean
}

type LiveLinkStatus = {
  installed: boolean
  connected: boolean
  serveEnabled: boolean
}

const TOTAL_STEPS = 5
const READY_STEP = TOTAL_STEPS

export function WelcomeScreen({ onComplete }: { onComplete: (settings: AppSettings) => void }) {
  const [step, setStep] = React.useState(0)
  const [settings, setSettings] = React.useState<AppSettings>({
    completed: true,
    language: "uk",
    sitesDirectory: "",
    theme: "dark",
    runtime: "auto",
    compactSidebar: false,
    reduceMotion: false,
    confirmDestructive: true,
    defaultWebServer: "Nginx",
    defaultPhpVersion: "8.4",
    defaultNodeVersion: "22",
    defaultDatabase: "MariaDB",
    defaultDatabaseVersion: "11.8",
    autoInitGit: true,
    autoStartProjects: true,
  })
  const [freeSpace, setFreeSpace] = React.useState<number | null | undefined>(undefined)
  const [runtimeStatus, setRuntimeStatus] = React.useState<Runtime | null>(null)
  const [runtimeChecking, setRuntimeChecking] = React.useState(false)
  const [liveLinkStatus, setLiveLinkStatus] = React.useState<LiveLinkStatus | null>(null)
  const [error, setError] = React.useState("")
  const uk = settings.language in welcomeScreenText ? settings.language === "uk" : false
  const text = pickLanguage(welcomeScreenText, uk)

  React.useEffect(() => {
    applyTheme(settings.theme)
  }, [settings.theme])
  React.useEffect(() => {
    void homeDir()
      .then((home) => join(home, "LSP Sites"))
      .then((sitesDirectory) =>
        setSettings((current) =>
          current.sitesDirectory ? current : { ...current, sitesDirectory },
        ),
      )
      .catch(() => {})
  }, [])
  React.useEffect(() => {
    if (!settings.sitesDirectory) return
    setFreeSpace(undefined)
    invoke<number>("workspace_free_space", { path: settings.sitesDirectory })
      .then(setFreeSpace)
      .catch(() => setFreeSpace(null))
  }, [settings.sitesDirectory])

  const checkRuntime = React.useCallback(() => {
    setRuntimeChecking(true)
    invoke<Runtime>("container_runtime_status")
      .then(setRuntimeStatus)
      .catch(() => setRuntimeStatus(null))
      .finally(() => setRuntimeChecking(false))
  }, [])
  React.useEffect(() => {
    if (step === 3 && !runtimeStatus && !runtimeChecking) checkRuntime()
  }, [step, runtimeStatus, runtimeChecking, checkRuntime])
  React.useEffect(() => {
    if (step === 4 && !liveLinkStatus) {
      invoke<LiveLinkStatus>("livelink_status")
        .then(setLiveLinkStatus)
        .catch(() => setLiveLinkStatus(null))
    }
  }, [step, liveLinkStatus])

  async function chooseDirectory() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: text.workspace.choose,
    })
    if (typeof selected === "string") setSettings({ ...settings, sitesDirectory: selected })
  }
  function openExternal(url: string) {
    void invoke("open_url", { url }).catch((value) => setError(errorMessage(value)))
  }
  async function finish() {
    try {
      setError("")
      onComplete(await invoke<AppSettings>("save_settings", { settings }))
    } catch (value) {
      setError(errorMessage(value))
    }
  }

  const canAdvance = step !== 2 || Boolean(settings.sitesDirectory)

  return (
    <main className="flex h-full min-h-0 w-full overflow-y-auto bg-background p-4 text-foreground sm:p-6">
      <div className="m-auto flex w-full max-w-2xl flex-col gap-5 py-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl border bg-card shadow-sm">
            <Server className="size-5" />
          </div>
          {step < READY_STEP && (
            <div className="flex w-full max-w-xs flex-col items-center gap-1.5">
              <Progress value={((step + 1) / TOTAL_STEPS) * 100} className="w-full" />
              <p className="text-[10px] font-medium tracking-[.18em] text-muted-foreground uppercase">
                {text.stepOf(step + 1, TOTAL_STEPS)}
              </p>
            </div>
          )}
        </div>

        <Card className="gap-0 py-0 shadow-sm">
          {step === 0 && <WelcomeStep text={text} />}
          {step === 1 && <AppearanceStep text={text} settings={settings} onChange={setSettings} />}
          {step === 2 && (
            <WorkspaceStep
              text={text}
              directory={settings.sitesDirectory}
              freeSpace={freeSpace}
              onChoose={chooseDirectory}
            />
          )}
          {step === 3 && (
            <EnvironmentStep
              text={text}
              status={runtimeStatus}
              checking={runtimeChecking}
              onRetry={checkRuntime}
              onInstallGuide={() => openExternal("https://docs.docker.com/engine/install/")}
            />
          )}
          {step === 4 && (
            <RemoteAccessStep
              text={text}
              status={liveLinkStatus}
              onInstall={() => openExternal("https://tailscale.com/download")}
            />
          )}
          {step === READY_STEP && (
            <ReadyStep
              text={text}
              settings={settings}
              runtimeStatus={runtimeStatus}
              liveLinkStatus={liveLinkStatus}
              onStart={finish}
            />
          )}
          {step < READY_STEP && (
            <CardFooter className="justify-between gap-3 py-4">
              {step > 0 ? (
                <Button variant="ghost" onClick={() => setStep((value) => value - 1)}>
                  <ChevronLeft />
                  {text.back}
                </Button>
              ) : (
                <span />
              )}
              <Button onClick={() => setStep((value) => value + 1)} disabled={!canAdvance}>
                {step === 0 ? text.welcome.getStarted : text.next}
                <ChevronRight />
              </Button>
            </CardFooter>
          )}
        </Card>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </main>
  )
}

type WelcomeText = (typeof welcomeScreenText)["en"]

function WelcomeStep({ text }: { text: WelcomeText }) {
  return (
    <CardContent className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <p className="text-[10px] font-medium tracking-[.22em] text-muted-foreground uppercase">
        {text.welcome.eyebrow}
      </p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{text.welcome.title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{text.welcome.subtitle}</p>
    </CardContent>
  )
}

function AppearanceStep({
  text,
  settings,
  onChange,
}: {
  text: WelcomeText
  settings: AppSettings
  onChange: (settings: AppSettings) => void
}) {
  return (
    <>
      <CardHeader className="border-b py-4">
        <CardTitle>{text.appearance.title}</CardTitle>
        <p className="text-sm text-muted-foreground">{text.appearance.subtitle}</p>
      </CardHeader>
      <CardContent className="divide-y px-0">
        <OnboardingRow icon={Globe2} title={text.appearance.language}>
          <GlassSelect
            value={settings.language}
            onChange={(language) => onChange({ ...settings, language })}
            label={text.appearance.language}
            options={[
              ["uk", "Українська"],
              ["en", "English"],
            ]}
          />
        </OnboardingRow>
        <OnboardingRow icon={Moon} title={text.appearance.theme}>
          <GlassSelect
            value={settings.theme}
            onChange={(theme) => onChange({ ...settings, theme })}
            label={text.appearance.theme}
            options={[
              ["dark", text.appearance.dark],
              ["light", text.appearance.light],
              ["system", text.appearance.system],
            ]}
          />
        </OnboardingRow>
      </CardContent>
    </>
  )
}

function WorkspaceStep({
  text,
  directory,
  freeSpace,
  onChoose,
}: {
  text: WelcomeText
  directory: string
  freeSpace: number | null | undefined
  onChoose: () => void
}) {
  return (
    <>
      <CardHeader className="border-b py-4">
        <CardTitle>{text.workspace.title}</CardTitle>
        <p className="text-sm text-muted-foreground">{text.workspace.subtitle}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4 py-4">
        <OnboardingRow icon={FolderOpen} title={text.workspace.directory}>
          <Button variant="outline" className="w-full min-w-0 justify-start" onClick={onChoose}>
            <FolderOpen />
            <span className="truncate">{directory || text.workspace.choose}</span>
          </Button>
        </OnboardingRow>
        <p className="px-1 text-xs text-muted-foreground">{text.workspace.directoryHint}</p>
        {directory && (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <HardDrive className="size-3.5 shrink-0" />
            {freeSpace === undefined && <span>…</span>}
            {freeSpace === null && <span>{text.workspace.freeSpaceUnknown}</span>}
            {typeof freeSpace === "number" && (
              <span>{text.workspace.freeSpace(formatMetricBytes(freeSpace))}</span>
            )}
          </div>
        )}
      </CardContent>
    </>
  )
}

function EnvironmentStep({
  text,
  status,
  checking,
  onRetry,
  onInstallGuide,
}: {
  text: WelcomeText
  status: Runtime | null
  checking: boolean
  onRetry: () => void
  onInstallGuide: () => void
}) {
  const ready = Boolean(status?.installed && status?.running && status?.composeAvailable)
  const rows = [
    {
      ok: Boolean(status?.installed),
      label: text.environment.installed,
      fallback: text.environment.notFound,
    },
    {
      ok: Boolean(status?.running),
      label: text.environment.running,
      fallback: text.environment.notRunning,
    },
    {
      ok: Boolean(status?.composeAvailable),
      label: text.environment.compose,
      fallback: text.environment.notAvailable,
    },
  ]
  return (
    <>
      <CardHeader className="border-b py-4">
        <CardTitle>{text.environment.title}</CardTitle>
        <p className="text-sm text-muted-foreground">{text.environment.subtitle}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-4 py-4">
        {checking && !status && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {text.environment.checking}
          </p>
        )}
        {status &&
          rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm"
            >
              {row.ok ? (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
              ) : (
                <XCircle className="size-4 shrink-0 text-destructive" />
              )}
              <span>{row.ok ? row.label : row.fallback}</span>
            </div>
          ))}
        {status && !ready && (
          <Alert className="mt-1">
            <AlertDescription className="flex flex-col gap-2">
              <span>{text.environment.notReadyHint}</span>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={onInstallGuide}>
                  <Download />
                  {text.environment.installGuide}
                </Button>
                <Button variant="outline" size="sm" onClick={onRetry} disabled={checking}>
                  <RotateCw className={checking ? "animate-spin" : ""} />
                  {text.environment.retry}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </>
  )
}

function RemoteAccessStep({
  text,
  status,
  onInstall,
}: {
  text: WelcomeText
  status: LiveLinkStatus | null
  onInstall: () => void
}) {
  return (
    <>
      <CardHeader className="border-b py-4">
        <CardTitle>{text.remoteAccess.title}</CardTitle>
        <p className="text-sm text-muted-foreground">{text.remoteAccess.subtitle}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-4 py-4">
        <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm">
          {status?.installed ? (
            <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
          ) : (
            <Wifi className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span>
            {status?.installed ? text.remoteAccess.installed : text.remoteAccess.notInstalled}
          </span>
        </div>
        {status?.installed && (
          <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm">
            {status.connected ? (
              <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
            ) : (
              <XCircle className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span>
              {status.connected ? text.remoteAccess.connected : text.remoteAccess.notConnected}
            </span>
          </div>
        )}
        {!status?.installed && (
          <Button variant="outline" size="sm" className="self-start" onClick={onInstall}>
            <Download />
            {text.remoteAccess.install}
          </Button>
        )}
        <p className="px-1 text-xs text-muted-foreground">{text.remoteAccess.enableLaterHint}</p>
      </CardContent>
    </>
  )
}

function ReadyStep({
  text,
  settings,
  runtimeStatus,
  liveLinkStatus,
  onStart,
}: {
  text: WelcomeText
  settings: AppSettings
  runtimeStatus: Runtime | null
  liveLinkStatus: LiveLinkStatus | null
  onStart: () => void
}) {
  const dockerReady = Boolean(
    runtimeStatus?.installed && runtimeStatus?.running && runtimeStatus?.composeAvailable,
  )
  const themeLabel =
    settings.theme === "dark"
      ? text.appearance.dark
      : settings.theme === "light"
        ? text.appearance.light
        : text.appearance.system
  const rows = [
    { label: text.ready.language, value: settings.language === "uk" ? "Українська" : "English" },
    { label: text.ready.theme, value: themeLabel },
    { label: text.ready.projects, value: settings.sitesDirectory },
    { label: text.ready.docker, value: dockerReady ? text.ready.ready : text.ready.notReady },
    {
      label: text.ready.remoteAccess,
      value: liveLinkStatus?.installed ? text.ready.installedLabel : text.ready.notInstalledLabel,
    },
  ]
  return (
    <>
      <CardContent className="flex flex-col items-center gap-1 px-6 pt-8 pb-2 text-center">
        <Check className="size-6 text-emerald-500" />
        <h1 className="text-xl font-semibold tracking-tight">{text.ready.title}</h1>
        <p className="text-sm text-muted-foreground">{text.ready.subtitle}</p>
      </CardContent>
      <CardContent className="flex flex-col gap-2 px-4 py-4">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm"
          >
            <span className="text-muted-foreground">{row.label}</span>
            <span className="truncate font-medium">{row.value}</span>
          </div>
        ))}
      </CardContent>
      <CardFooter className="justify-center py-5">
        <Button size="lg" onClick={onStart}>
          {text.ready.start}
          <Check />
        </Button>
      </CardFooter>
    </>
  )
}

function OnboardingRow({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Globe2
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-3 px-4 py-4 sm:grid-cols-[36px_minmax(0,1fr)_220px] sm:items-center">
      <div className="flex size-9 items-center justify-center rounded-lg border bg-muted/50">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <h2 className="text-sm font-medium">{title}</h2>
      </div>
      <div className="min-w-0 sm:col-start-3">{children}</div>
    </div>
  )
}

export function GlassSelect({
  value,
  options,
  onChange,
  label,
}: {
  value: string
  options: string[][]
  onChange: (value: string) => void
  label: string
}) {
  return (
    <Select value={value} onValueChange={(nextValue) => nextValue && onChange(String(nextValue))}>
      <SelectTrigger aria-label={label} className="w-full">
        <SelectValue>{options.find(([option]) => option === value)?.[1]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map(([option, optionLabel]) => (
          <SelectItem key={option} value={option}>
            {optionLabel}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
