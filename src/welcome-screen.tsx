import React from "react"
import { open } from "@tauri-apps/plugin-dialog"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
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
import { dependencyInstallPlan, type DependencyInstallPlan } from "@/lib/install"
import { DependencyInstallDialog } from "@/components/dependency-install-dialog"
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
  preferredEditor: string
  customEditorCommand: string
  notifyOnOperations: boolean
  diskSpaceAlertEnabled: boolean
  diskSpaceAlertThresholdGb: number
  autoStopIdleEnabled: boolean
  autoStopIdleMinutes: number
  autoHealEnabled: boolean
  gitStatusNotifyEnabled: boolean
  gitStatusBehindThreshold: number
  tlsExpiryNotifyEnabled: boolean
  tlsExpiryWarningDays: number
  webhookUrl: string
}

type LiveLinkStatus = {
  installed: boolean
  connected: boolean
  serveEnabled: boolean
  providers: Array<{ id: string; installed: boolean; authenticated?: boolean }>
}

type HealthCheck = {
  code: string
  title: string
  status: string
  summary: string
  suggestions: string[]
}
type HealthReport = { checks: HealthCheck[] }

const TOOL_CHECK_CODES = ["GIT", "OPENSSL", "NSS_TOOLS"]

const REMOTE_ACCESS_PROVIDERS = [
  { id: "tailscale", name: "Tailscale", installUrl: "https://tailscale.com/download" },
  { id: "ngrok", name: "ngrok", installUrl: "https://ngrok.com/download" },
  {
    id: "cloudflare",
    name: "Cloudflare Tunnel",
    installUrl:
      "https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/create-local-tunnel/",
  },
] as const

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
    preferredEditor: "code",
    customEditorCommand: "",
    notifyOnOperations: true,
    diskSpaceAlertEnabled: true,
    diskSpaceAlertThresholdGb: 5,
    autoStopIdleEnabled: false,
    autoStopIdleMinutes: 60,
    autoHealEnabled: false,
    gitStatusNotifyEnabled: false,
    gitStatusBehindThreshold: 5,
    tlsExpiryNotifyEnabled: true,
    tlsExpiryWarningDays: 14,
    webhookUrl: "",
  })
  const [freeSpace, setFreeSpace] = React.useState<number | null | undefined>(undefined)
  const [runtimeStatus, setRuntimeStatus] = React.useState<Runtime | null>(null)
  const [runtimes, setRuntimes] = React.useState<Runtime[] | null>(null)
  const [tools, setTools] = React.useState<HealthCheck[] | null>(null)
  const [runtimeChecking, setRuntimeChecking] = React.useState(false)
  const [liveLinkStatus, setLiveLinkStatus] = React.useState<LiveLinkStatus | null>(null)
  const [error, setError] = React.useState("")
  const [installHint, setInstallHint] = React.useState("")
  const [installingTool, setInstallingTool] = React.useState("")
  const [pendingInstall, setPendingInstall] = React.useState<DependencyInstallPlan | null>(null)
  const [cloudflareAuthBusy, setCloudflareAuthBusy] = React.useState(false)
  const [cloudflareLoginUrl, setCloudflareLoginUrl] = React.useState("")
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
    Promise.all([
      invoke<Runtime>("container_runtime_status"),
      invoke<Runtime[]>("container_runtimes_status"),
      invoke<HealthReport>("system_health").catch(() => null),
    ])
      .then(([status, list, health]) => {
        setRuntimeStatus(status)
        setRuntimes(list)
        setTools(health?.checks.filter((check) => TOOL_CHECK_CODES.includes(check.code)) ?? null)
      })
      .catch(() => {
        setRuntimeStatus(null)
        setRuntimes(null)
        setTools(null)
      })
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
  async function handleInstall(tool: string, fallbackUrl: string) {
    setInstallHint("")
    setError("")
    try {
      setPendingInstall(await dependencyInstallPlan(tool, fallbackUrl))
    } catch (value) {
      setError(errorMessage(value))
    }
  }
  function handleInstalled() {
    setInstallHint(text.installedHint)
    checkRuntime()
    if (step === 4) setLiveLinkStatus(null)
  }
  async function authenticateCloudflare() {
    setCloudflareAuthBusy(true)
    setCloudflareLoginUrl("")
    setError("")
    const unlisten = await listen<string>("cloudflare-login-url", ({ payload }) =>
      setCloudflareLoginUrl(payload),
    )
    try {
      await invoke("cloudflare_tunnel_login")
      setInstallHint(text.remoteAccess.cloudflareAuthenticated)
      setLiveLinkStatus(null)
    } catch (value) {
      setError(errorMessage(value))
    } finally {
      unlisten()
      setCloudflareAuthBusy(false)
      setCloudflareLoginUrl("")
    }
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
        {step > 0 && step < READY_STEP && (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-11 items-center justify-center rounded-xl border bg-black dark:bg-white text-white dark:text-black shadow-sm">
              <Server className="size-5" />
            </div>
            <p className="text-md font-bold tracking-[.18em] text-muted-foreground dark:text-white uppercase">
              LS Panel
            </p>
            <div className="flex w-full max-w-xs flex-col items-center gap-1.5">
              <Progress value={((step + 1) / TOTAL_STEPS) * 100} className="w-full" />
              <p className="text-[10px] font-medium tracking-[.18em] text-muted-foreground uppercase">
                {text.stepOf(step + 1, TOTAL_STEPS)}
              </p>
            </div>
          </div>
        )}

        {step === 0 ? (
          <WelcomeStep text={text} onStart={() => setStep(1)} />
        ) : (
          <Card className="gap-0 py-0">
            {step === 1 && (
              <AppearanceStep text={text} settings={settings} onChange={setSettings} />
            )}
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
                runtimes={runtimes}
                tools={tools}
                checking={runtimeChecking}
                onRetry={checkRuntime}
                onInstallGuide={() => openExternal("https://docs.docker.com/engine/install/")}
                onInstall={handleInstall}
                installHint={installHint}
                installingTool={installingTool}
              />
            )}
            {step === 4 && (
              <RemoteAccessStep
                text={text}
                status={liveLinkStatus}
                onInstall={handleInstall}
                installHint={installHint}
                installingTool={installingTool}
                cloudflareAuthBusy={cloudflareAuthBusy}
                cloudflareLoginUrl={cloudflareLoginUrl}
                onAuthenticateCloudflare={() => void authenticateCloudflare()}
                onOpenUrl={openExternal}
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
                <Button variant="ghost" onClick={() => setStep((value) => value - 1)}>
                  <ChevronLeft />
                  {text.back}
                </Button>
                <Button onClick={() => setStep((value) => value + 1)} disabled={!canAdvance}>
                  {text.next}
                  <ChevronRight />
                </Button>
              </CardFooter>
            )}
          </Card>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DependencyInstallDialog
          plan={pendingInstall}
          text={text.installer}
          onClose={() => setPendingInstall(null)}
          onBusyChange={setInstallingTool}
          onInstalled={handleInstalled}
        />
      </div>
    </main>
  )
}

type WelcomeText = (typeof welcomeScreenText)["en"]

function WelcomeStep({ text, onStart }: { text: WelcomeText; onStart: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="flex size-11 items-center justify-center rounded-xl border bg-black dark:bg-white text-white dark:text-black shadow-sm">
        <Server className="size-5" />
      </div>
      <p className="text-xs font-medium tracking-[.18em] text-muted-foreground uppercase">
        {text.welcome.eyebrow}
      </p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{text.welcome.title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{text.welcome.subtitle}</p>
      <Button size="lg" className="mt-3" onClick={onStart}>
        {text.welcome.getStarted}
        <ChevronRight />
      </Button>
    </div>
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

const TOOL_INSTALL_IDS: Record<string, { id: string; fallbackUrl: string }> = {
  GIT: { id: "git", fallbackUrl: "https://git-scm.com/downloads" },
  OPENSSL: { id: "openssl", fallbackUrl: "https://openssl.org/source/" },
  NSS_TOOLS: {
    id: "nss-tools",
    fallbackUrl: "https://firefox-source-docs.mozilla.org/security/nss/index.html",
  },
}

function EnvironmentStep({
  text,
  status,
  runtimes,
  tools,
  checking,
  onRetry,
  onInstallGuide,
  onInstall,
  installHint,
  installingTool,
}: {
  text: WelcomeText
  status: Runtime | null
  runtimes: Runtime[] | null
  tools: HealthCheck[] | null
  checking: boolean
  onRetry: () => void
  onInstallGuide: () => void
  onInstall: (tool: string, fallbackUrl: string) => void
  installHint: string
  installingTool: string
}) {
  const ready = Boolean(status?.installed && status?.running && status?.composeAvailable)
  return (
    <>
      <CardHeader className="border-b py-4">
        <CardTitle>{text.environment.title}</CardTitle>
        <p className="text-sm text-muted-foreground">{text.environment.subtitle}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-4 py-4">
        {checking && !runtimes && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {text.environment.checking}
          </p>
        )}
        {runtimes?.map((runtime) => {
          const name = runtime.runtime === "podman" ? "Podman" : "Docker"
          const runtimeReady = runtime.installed && runtime.running && runtime.composeAvailable
          const needsDockerAccess =
            runtime.runtime === "docker" &&
            runtime.installed &&
            !runtime.running &&
            runtime.message.toLowerCase().includes("permission denied")
          const detail = !runtime.installed
            ? text.environment.notFound
            : !runtime.running
              ? runtime.message || text.environment.notRunning
              : !runtime.composeAvailable
                ? text.environment.notAvailable
                : text.environment.ready
          return (
            <div
              key={runtime.runtime ?? name}
              className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm"
            >
              {runtimeReady ? (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
              ) : runtime.installed ? (
                <XCircle className="size-4 shrink-0 text-amber-500" />
              ) : (
                <XCircle className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="flex-1 font-medium">
                {name}
                {runtime.version && (
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    {runtime.version}
                  </span>
                )}
              </span>
              <span className="max-w-[45%] truncate text-xs text-muted-foreground" title={detail}>
                {detail}
              </span>
              {!runtime.installed && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={Boolean(installingTool)}
                  onClick={() =>
                    onInstall(
                      runtime.runtime ?? "docker",
                      runtime.runtime === "podman"
                        ? "https://podman.io/docs/installation"
                        : "https://docs.docker.com/engine/install/",
                    )
                  }
                >
                  {installingTool === (runtime.runtime ?? "docker") ? (
                    <RotateCw className="animate-spin" />
                  ) : (
                    <Download />
                  )}
                  {installingTool === (runtime.runtime ?? "docker")
                    ? text.installing
                    : text.install}
                </Button>
              )}
              {needsDockerAccess && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={Boolean(installingTool)}
                  onClick={() =>
                    onInstall(
                      "docker-access",
                      "https://docs.docker.com/engine/install/linux-postinstall/",
                    )
                  }
                >
                  {installingTool === "docker-access" ? (
                    <RotateCw className="animate-spin" />
                  ) : (
                    <Check />
                  )}
                  {installingTool === "docker-access"
                    ? text.installing
                    : text.environment.grantAccess}
                </Button>
              )}
            </div>
          )
        })}
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
        {tools && tools.length > 0 && (
          <>
            <p className="mt-2 px-1 text-xs font-medium tracking-[.1em] text-muted-foreground uppercase">
              {text.environment.additionalTools}
            </p>
            {tools.map((tool) => {
              const installInfo = TOOL_INSTALL_IDS[tool.code]
              return (
                <div key={tool.code} className="rounded-lg border px-3 py-2.5 text-sm">
                  <div className="flex items-center gap-3">
                    {tool.status === "healthy" ? (
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                    ) : (
                      <XCircle className="size-4 shrink-0 text-amber-500" />
                    )}
                    <span className="flex-1 font-medium">{tool.title}</span>
                    <span className="max-w-[40%] truncate text-xs text-muted-foreground">
                      {tool.summary}
                    </span>
                    {tool.status !== "healthy" && installInfo && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={Boolean(installingTool)}
                        onClick={() => onInstall(installInfo.id, installInfo.fallbackUrl)}
                      >
                        {installingTool === installInfo.id ? (
                          <RotateCw className="animate-spin" />
                        ) : (
                          <Download />
                        )}
                        {installingTool === installInfo.id ? text.installing : text.install}
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </>
        )}
        {installHint && <p className="px-1 text-xs text-muted-foreground">{installHint}</p>}
      </CardContent>
    </>
  )
}

function RemoteAccessStep({
  text,
  status,
  onInstall,
  installHint,
  installingTool,
  cloudflareAuthBusy,
  cloudflareLoginUrl,
  onAuthenticateCloudflare,
  onOpenUrl,
}: {
  text: WelcomeText
  status: LiveLinkStatus | null
  onInstall: (tool: string, fallbackUrl: string) => void
  installHint: string
  installingTool: string
  cloudflareAuthBusy: boolean
  cloudflareLoginUrl: string
  onAuthenticateCloudflare: () => void
  onOpenUrl: (url: string) => void
}) {
  return (
    <>
      <CardHeader className="border-b py-4">
        <CardTitle>{text.remoteAccess.title}</CardTitle>
        <p className="text-sm text-muted-foreground">{text.remoteAccess.subtitle}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-4 py-4">
        {REMOTE_ACCESS_PROVIDERS.map((provider) => {
          const installed = status?.providers.find((item) => item.id === provider.id)?.installed
          return (
            <div key={provider.id} className="rounded-lg border px-3 py-2.5">
              <div className="flex items-center gap-3 text-sm">
                {installed ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                ) : (
                  <Wifi className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="flex-1">
                  {installed
                    ? text.remoteAccess.installed(provider.name)
                    : text.remoteAccess.notInstalled(provider.name)}
                </span>
                {!installed && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={Boolean(installingTool)}
                    onClick={() => onInstall(provider.id, provider.installUrl)}
                  >
                    {installingTool === provider.id ? (
                      <RotateCw className="animate-spin" />
                    ) : (
                      <Download />
                    )}
                    {installingTool === provider.id
                      ? text.installing
                      : text.remoteAccess.install(provider.name)}
                  </Button>
                )}
              </div>
              {provider.id === "tailscale" && installed && (
                <div className="mt-2 flex items-center gap-3 pl-7 text-xs text-muted-foreground">
                  {status?.connected ? (
                    <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
                  ) : (
                    <XCircle className="size-3.5 shrink-0" />
                  )}
                  <span>
                    {status?.connected
                      ? text.remoteAccess.connected
                      : text.remoteAccess.notConnected}
                  </span>
                </div>
              )}
              {provider.id === "cloudflare" && installed && (
                <div className="mt-2 space-y-2 pl-7">
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>
                      {status?.providers.find((item) => item.id === "cloudflare")?.authenticated
                        ? text.remoteAccess.cloudflareAuthenticated
                        : text.remoteAccess.cloudflareAuthenticationRequired}
                    </span>
                    {!status?.providers.find((item) => item.id === "cloudflare")?.authenticated && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={cloudflareAuthBusy}
                        onClick={onAuthenticateCloudflare}
                      >
                        {cloudflareAuthBusy && <RotateCw className="animate-spin" />}
                        {text.remoteAccess.authenticateCloudflare}
                      </Button>
                    )}
                  </div>
                  {cloudflareAuthBusy && (
                    <div className="space-y-2 rounded-lg border border-dashed p-3">
                      <p className="text-xs text-muted-foreground">
                        {text.remoteAccess.cloudflareAuthUrlHint}
                      </p>
                      {cloudflareLoginUrl ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onOpenUrl(cloudflareLoginUrl)}
                        >
                          {text.remoteAccess.openCloudflareAuthUrl}
                        </Button>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {text.remoteAccess.cloudflareFetchingUrl}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {installHint && <p className="px-1 text-xs text-muted-foreground">{installHint}</p>}
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
      value: liveLinkStatus?.providers.some((provider) => provider.installed)
        ? text.ready.installedLabel
        : text.ready.notInstalledLabel,
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
