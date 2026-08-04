import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { ExternalLink, Globe2, LockKeyhole, RefreshCw, Unplug } from "lucide-react"

import { PageHeading } from "@/components/page-heading"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { errorMessage } from "@/lib/errors"
import { installTool } from "@/lib/install"
import type { Site } from "@/types"

type TunnelProvider = "tailscale" | "ngrok" | "cloudflare"

type LiveLinkStatus = {
  installed: boolean
  connected: boolean
  serveEnabled: boolean
  version?: string
  dnsName?: string
  enableUrl?: string
  active: boolean
  siteId?: string
  mode?: string
  url?: string
  providers: Array<{ id: TunnelProvider; installed: boolean; authenticated?: boolean }>
  links: Array<{
    siteId: string
    provider: TunnelProvider
    mode: string
    port: number
    localPort: number
    providerActive: boolean
    gatewayActive: boolean
    projectReachable: boolean
    url?: string
    status:
      "active" | "orphaned" | "gateway_unavailable" | "project_unavailable" | "provider_inactive"
  }>
  message: string
}

const PROVIDER_OPTIONS: Array<{ id: TunnelProvider; name: string; installUrl: string }> = [
  { id: "tailscale", name: "Tailscale", installUrl: "https://tailscale.com/download" },
  { id: "ngrok", name: "ngrok", installUrl: "https://ngrok.com/download" },
  {
    id: "cloudflare",
    name: "Cloudflare Tunnel",
    installUrl:
      "https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/create-local-tunnel/",
  },
]

function providerName(id: string) {
  return PROVIDER_OPTIONS.find((option) => option.id === id)?.name ?? id
}

export function LiveLinkPage({ sites, uk }: { sites: Site[]; uk: boolean }) {
  const [status, setStatus] = React.useState<LiveLinkStatus | null>(null)
  const [siteId, setSiteId] = React.useState(sites[0]?.id ?? "")
  const [provider, setProvider] = React.useState<TunnelProvider>("tailscale")
  const [mode, setMode] = React.useState<"serve" | "funnel">("serve")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const [installHint, setInstallHint] = React.useState("")
  const [ngrokToken, setNgrokToken] = React.useState("")
  const [ngrokTokenBusy, setNgrokTokenBusy] = React.useState(false)
  const [ngrokTokenStatus, setNgrokTokenStatus] = React.useState("")
  const [cloudflareHostname, setCloudflareHostname] = React.useState("")
  const [cloudflareAuthBusy, setCloudflareAuthBusy] = React.useState(false)
  const initialized = React.useRef(false)

  async function handleInstall(tool: string, fallbackUrl: string) {
    setInstallHint("")
    try {
      const outcome = await installTool(tool, fallbackUrl)
      setInstallHint(
        outcome === "installed"
          ? uk
            ? "Пакет успішно встановлено."
            : "The package was installed successfully."
          : "",
      )
      if (outcome === "installed") await refresh()
    } catch (value) {
      setError(errorMessage(value))
    }
  }

  async function saveNgrokToken() {
    setNgrokTokenBusy(true)
    setNgrokTokenStatus("")
    try {
      await invoke("set_ngrok_authtoken", { token: ngrokToken })
      setNgrokToken("")
      setNgrokTokenStatus(uk ? "Authtoken збережено." : "Authtoken saved.")
    } catch (value) {
      setNgrokTokenStatus(errorMessage(value))
    } finally {
      setNgrokTokenBusy(false)
    }
  }

  async function authenticateCloudflare() {
    setCloudflareAuthBusy(true)
    setError("")
    try {
      await invoke("cloudflare_tunnel_login")
      setInstallHint(uk ? "Cloudflare успішно авторизовано." : "Cloudflare authenticated.")
      await refresh()
    } catch (value) {
      setError(errorMessage(value))
    } finally {
      setCloudflareAuthBusy(false)
    }
  }

  // Picks the first site that isn't already published, so the form is ready
  // to add the *next* project instead of re-selecting one that's running.
  const nextUnlinkedSite = React.useCallback(
    (links: LiveLinkStatus["links"]) => {
      const linked = new Set(
        links.filter((link) => link.status === "active").map((link) => link.siteId),
      )
      return sites.find((site) => !linked.has(site.id))?.id ?? sites[0]?.id ?? ""
    },
    [sites],
  )

  const activeLinks = status?.links.filter((link) => link.status === "active") ?? []

  const refresh = React.useCallback(async () => {
    try {
      const next = await invoke<LiveLinkStatus>("livelink_status")
      setStatus(next)
      // Only seed the form from server state once. After that, background
      // refreshes (focus, polling) must never overwrite the user's own pick —
      // that was snapping the select back to whichever project was already live.
      if (!initialized.current) {
        initialized.current = true
        setSiteId(nextUnlinkedSite(next.links))
        if (next.mode === "serve" || next.mode === "funnel") setMode(next.mode)
        const activeProvider = next.links.find((link) => link.status === "active")?.provider
        if (activeProvider) setProvider(activeProvider)
      }
    } catch (value) {
      setError(errorMessage(value))
    }
  }, [nextUnlinkedSite])

  React.useEffect(() => void refresh(), [refresh])

  React.useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    window.addEventListener("focus", refreshWhenVisible)
    document.addEventListener("visibilitychange", refreshWhenVisible)
    return () => {
      window.removeEventListener("focus", refreshWhenVisible)
      document.removeEventListener("visibilitychange", refreshWhenVisible)
    }
  }, [refresh])

  React.useEffect(() => {
    if (!status?.connected || status.serveEnabled) return
    const timer = window.setInterval(() => void refresh(), 3000)
    return () => window.clearInterval(timer)
  }, [refresh, status?.connected, status?.serveEnabled])

  const start = async () => {
    if (!siteId) return
    setBusy(true)
    setError("")
    try {
      const next = await invoke<LiveLinkStatus>("start_livelink", {
        siteId,
        mode: provider === "tailscale" ? mode : "tunnel",
        provider,
        hostname: provider === "cloudflare" ? cloudflareHostname : null,
      })
      setStatus(next)
      setSiteId(nextUnlinkedSite(next.links))
    } catch (value) {
      setError(errorMessage(value))
    } finally {
      setBusy(false)
    }
  }

  const providerInstalled = (id: TunnelProvider) =>
    status?.providers.find((item) => item.id === id)?.installed ?? false
  const providerReady =
    provider === "tailscale"
      ? Boolean(status?.connected && status.serveEnabled)
      : provider === "cloudflare"
        ? Boolean(
            providerInstalled("cloudflare") &&
            status?.providers.find((item) => item.id === "cloudflare")?.authenticated &&
            cloudflareHostname.trim(),
          )
        : providerInstalled(provider)

  const stop = async () => {
    setBusy(true)
    setError("")
    try {
      const next = await invoke<LiveLinkStatus>("stop_livelink")
      setStatus(next)
      setSiteId(nextUnlinkedSite(next.links))
    } catch (value) {
      setError(errorMessage(value))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeading
        title="Live Link"
        description={
          uk
            ? "Безпечно відкривайте локальний сайт через Tailscale, ngrok або Cloudflare Tunnel."
            : "Securely expose a local site through Tailscale, ngrok, or Cloudflare Tunnel."
        }
        action={
          <Button variant="outline" disabled={busy} onClick={() => void refresh()}>
            <RefreshCw className={busy ? "animate-spin" : ""} />
            {uk ? "Оновити" : "Refresh"}
          </Button>
        }
      />
      <div className="grid gap-4 px-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)] lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>{uk ? "Публікація сайту" : "Share a site"}</CardTitle>
            <CardDescription>
              {uk
                ? "Додавайте кілька проєктів — кожен отримає власний порт."
                : "Add multiple projects, each with its own port."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">{uk ? "Провайдер" : "Provider"}</label>
              <div className="grid gap-3 sm:grid-cols-3">
                {PROVIDER_OPTIONS.map((option) => {
                  const info = status?.providers.find((item) => item.id === option.id)
                  const active = provider === option.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`rounded-xl border p-3 text-left transition-colors ${active ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                      onClick={() => setProvider(option.id)}
                    >
                      <div className="font-medium">{option.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {!info
                          ? uk
                            ? "Перевірка…"
                            : "Checking…"
                          : info.installed
                            ? uk
                              ? "Встановлено"
                              : "Installed"
                            : uk
                              ? "Не знайдено"
                              : "Not found"}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
            {provider === "tailscale" && !status?.installed && (
              <Alert>
                <AlertDescription className="space-y-3">
                  <p>
                    {uk
                      ? "Tailscale CLI не знайдено. Встановіть Tailscale та увійдіть у свій tailnet."
                      : "Tailscale CLI was not found. Install Tailscale and sign in to your tailnet."}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleInstall("tailscale", PROVIDER_OPTIONS[0].installUrl)}
                  >
                    {uk ? "Встановити Tailscale" : "Install Tailscale"}
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {provider === "tailscale" &&
              status?.connected &&
              !status.serveEnabled &&
              status.enableUrl && (
                <Alert>
                  <AlertDescription className="space-y-3">
                    <p>
                      {uk
                        ? "Tailscale Serve ще не активовано для цього пристрою."
                        : "Tailscale Serve is not enabled for this device yet."}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => void invoke("open_url", { url: status.enableUrl })}
                    >
                      <ExternalLink />
                      {uk ? "Активувати Tailscale Serve" : "Enable Tailscale Serve"}
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
            {provider !== "tailscale" && status && !providerInstalled(provider) && (
              <Alert>
                <AlertDescription className="space-y-3">
                  <p>
                    {uk
                      ? `CLI ${providerName(provider)} не знайдено. Встановіть його й переконайтесь, що він доступний у PATH.`
                      : `${providerName(provider)} CLI was not found. Install it and make sure it's on PATH.`}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const option = PROVIDER_OPTIONS.find((item) => item.id === provider)
                      if (option) void handleInstall(option.id, option.installUrl)
                    }}
                  >
                    {uk
                      ? `Встановити ${providerName(provider)}`
                      : `Install ${providerName(provider)}`}
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {provider === "ngrok" && status && providerInstalled("ngrok") && (
              <Alert>
                <AlertDescription className="space-y-3">
                  <p>
                    {uk
                      ? "ngrok потребує authtoken вашого облікового запису, щоб запускати тунелі."
                      : "ngrok needs your account's authtoken to start tunnels."}
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={ngrokToken}
                      onChange={(event) => setNgrokToken(event.target.value)}
                      placeholder="authtoken"
                      type="password"
                    />
                    <Button
                      variant="outline"
                      disabled={ngrokTokenBusy || !ngrokToken.trim()}
                      onClick={() => void saveNgrokToken()}
                    >
                      {uk ? "Зберегти" : "Save"}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() =>
                        void invoke("open_url", {
                          url: "https://dashboard.ngrok.com/get-started/your-authtoken",
                        })
                      }
                    >
                      <ExternalLink />
                      {uk ? "Отримати authtoken" : "Get your authtoken"}
                    </Button>
                    {ngrokTokenStatus && (
                      <span className="text-xs text-muted-foreground">{ngrokTokenStatus}</span>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}
            {provider === "cloudflare" && status && providerInstalled("cloudflare") && (
              <Alert>
                <AlertDescription className="space-y-3">
                  {!status.providers.find((item) => item.id === "cloudflare")?.authenticated ? (
                    <>
                      <p>
                        {uk
                          ? "Авторизуйте cloudflared. Відкриється браузер, де треба вибрати домен у вашому обліковому записі Cloudflare."
                          : "Authenticate cloudflared. A browser will open so you can select a domain from your Cloudflare account."}
                      </p>
                      <Button
                        variant="outline"
                        disabled={cloudflareAuthBusy}
                        onClick={() => void authenticateCloudflare()}
                      >
                        {cloudflareAuthBusy
                          ? uk
                            ? "Очікування авторизації…"
                            : "Waiting for authentication…"
                          : uk
                            ? "Авторизувати Cloudflare"
                            : "Authenticate Cloudflare"}
                      </Button>
                    </>
                  ) : (
                    <div className="space-y-2">
                      <p>
                        {uk
                          ? "Вкажіть повне доменне ім’я. LSPanel створить іменований тунель, DNS-запис і локальний config.yml."
                          : "Enter a full hostname. LSPanel will create a named tunnel, DNS record, and local config.yml."}
                      </p>
                      <Input
                        value={cloudflareHostname}
                        onChange={(event) => setCloudflareHostname(event.target.value)}
                        placeholder="app.example.com"
                        spellCheck={false}
                      />
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}
            {installHint && <p className="px-1 text-xs text-muted-foreground">{installHint}</p>}
            <div className="space-y-2">
              <label className="text-sm font-medium">{uk ? "Сайт" : "Site"}</label>
              <NativeSelect
                value={siteId}
                disabled={busy || sites.length === 0}
                onChange={(event) => setSiteId(event.target.value)}
              >
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name} — {site.domain}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {provider === "tailscale" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  className={`rounded-xl border p-4 text-left transition-colors ${mode === "serve" ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                  onClick={() => setMode("serve")}
                >
                  <LockKeyhole className="mb-3 size-5" />
                  <div className="font-medium">{uk ? "Приватний Serve" : "Private Serve"}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {uk ? "Лише користувачі вашого tailnet." : "Only users in your tailnet."}
                  </div>
                </button>
                <button
                  type="button"
                  className={`rounded-xl border p-4 text-left transition-colors ${mode === "funnel" ? "border-amber-500 bg-amber-500/5" : "hover:bg-muted/50"}`}
                  onClick={() => setMode("funnel")}
                >
                  <Globe2 className="mb-3 size-5" />
                  <div className="font-medium">{uk ? "Публічний Funnel" : "Public Funnel"}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {uk ? "Доступний усім в інтернеті." : "Accessible to anyone on the internet."}
                  </div>
                </button>
              </div>
            )}
            {provider === "tailscale" && mode === "funnel" && (
              <Alert>
                <AlertDescription>
                  {uk
                    ? "Увага: Funnel робить поточну версію сайту загальнодоступною."
                    : "Warning: Funnel makes the current site publicly accessible."}
                </AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || !siteId || !providerReady} onClick={() => void start()}>
                <Globe2 className={busy ? "animate-pulse" : ""} />
                {busy
                  ? uk
                    ? "Налаштування LiveLink…"
                    : "Configuring LiveLink…"
                  : status?.active
                    ? uk
                      ? "Додати проєкт"
                      : "Add project"
                    : uk
                      ? "Запустити"
                      : "Start"}
              </Button>
              {status?.active && (
                <Button variant="outline" disabled={busy} onClick={() => void stop()}>
                  <Unplug />
                  {uk ? "Зупинити" : "Stop"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{uk ? "Стан Tailscale" : "Tailscale status"}</CardTitle>
            <CardDescription>
              {status?.message ?? (uk ? "Перевірка…" : "Checking…")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Badge variant={status?.connected ? "default" : "secondary"}>
              {status?.connected
                ? uk
                  ? "Підключено"
                  : "Connected"
                : uk
                  ? "Не підключено"
                  : "Disconnected"}
            </Badge>
            {status?.version && (
              <p className="text-sm text-muted-foreground">Tailscale {status.version}</p>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{uk ? "Запущені проєкти" : "Running projects"}</CardTitle>
            <CardDescription>
              {uk
                ? "Сайти, доступні через активні тунелі."
                : "Sites available through active tunnels."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {status && activeLinks.length === 0 && (
              <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                {uk
                  ? "Ще немає проєктів, запущених через LiveLink."
                  : "No projects are currently running through LiveLink."}
              </div>
            )}
            {activeLinks.length > 0 && (
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{uk ? "Сайт" : "Site"}</TableHead>
                      <TableHead>{uk ? "Провайдер" : "Provider"}</TableHead>
                      <TableHead>{uk ? "Режим" : "Mode"}</TableHead>
                      <TableHead>{uk ? "Стан" : "Status"}</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead className="text-right">{uk ? "Дії" : "Actions"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeLinks.map((link) => {
                      const site = sites.find((item) => item.id === link.siteId)
                      const url = link.url
                      return (
                        <TableRow key={link.siteId}>
                          <TableCell>
                            <p className="font-medium">{site?.name ?? link.siteId}</p>
                            {site?.domain && (
                              <p className="text-xs text-muted-foreground">{site.domain}</p>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{providerName(link.provider)}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={link.mode === "funnel" ? "destructive" : "outline"}>
                              {link.mode === "funnel"
                                ? "Public Funnel"
                                : link.mode === "serve"
                                  ? "Private Serve"
                                  : uk
                                    ? "Тунель"
                                    : "Tunnel"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant={link.projectReachable ? "outline" : "destructive"}>
                                Project
                              </Badge>
                              <Badge variant={link.gatewayActive ? "outline" : "destructive"}>
                                Gateway
                              </Badge>
                              <Badge variant={link.providerActive ? "outline" : "destructive"}>
                                {providerName(link.provider)}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-64 truncate text-xs text-muted-foreground">
                            {url ?? (uk ? "Встановлюється…" : "Establishing…")}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!url}
                              onClick={() => url && void invoke("open_url", { url })}
                            >
                              <ExternalLink />
                              {uk ? "Відкрити" : "Open"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
