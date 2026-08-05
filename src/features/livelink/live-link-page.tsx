import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { ExternalLink, Globe2, LockKeyhole, RefreshCw, Unplug } from "lucide-react"

import { DependencyInstallDialog } from "@/components/dependency-install-dialog"
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
import { dependencyInstallPlan, type DependencyInstallPlan } from "@/lib/install"
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
  const [pendingInstall, setPendingInstall] = React.useState<DependencyInstallPlan | null>(null)
  const [installingTool, setInstallingTool] = React.useState("")
  const [ngrokToken, setNgrokToken] = React.useState("")
  const [ngrokTokenBusy, setNgrokTokenBusy] = React.useState(false)
  const [ngrokTokenStatus, setNgrokTokenStatus] = React.useState("")
  const [ngrokTokenEditing, setNgrokTokenEditing] = React.useState(false)
  const [ngrokHostname, setNgrokHostname] = React.useState("")
  const [cloudflareHostname, setCloudflareHostname] = React.useState("")
  const [cloudflareBaseDomain, setCloudflareBaseDomain] = React.useState(
    () => localStorage.getItem("lspanel.cloudflareBaseDomain") ?? "",
  )
  const [cloudflareAuthBusy, setCloudflareAuthBusy] = React.useState(false)
  const [cloudflareLoginUrl, setCloudflareLoginUrl] = React.useState("")
  const initialized = React.useRef(false)

  React.useEffect(() => {
    localStorage.setItem("lspanel.cloudflareBaseDomain", cloudflareBaseDomain)
  }, [cloudflareBaseDomain])

  // Keeps the hostname field in sync with "<site name>.<base domain>" as the
  // site or base domain changes — still a plain editable Input afterwards,
  // so a manual tweak isn't fought on the next render.
  React.useEffect(() => {
    if (provider !== "cloudflare" || !cloudflareBaseDomain.trim()) return
    const site = sites.find((item) => item.id === siteId)
    if (site) setCloudflareHostname(`${site.name}.${cloudflareBaseDomain.trim()}`)
  }, [provider, cloudflareBaseDomain, siteId, sites])

  async function handleInstall(tool: string, fallbackUrl: string) {
    setInstallHint("")
    setError("")
    try {
      setPendingInstall(await dependencyInstallPlan(tool, fallbackUrl))
    } catch (value) {
      setError(errorMessage(value))
    }
  }

  async function handleInstalled() {
    setInstallHint(uk ? "Пакет успішно встановлено." : "The package was installed successfully.")
    await refresh()
  }

  const installerText = {
    warningTitle: uk ? "Підтвердження встановлення" : "Confirm installation",
    warningDescription: uk
      ? "Перевірте команди перед запуском. Вони змінять пакети системи."
      : "Review the commands before running them. They will modify system packages.",
    adminWarning: uk
      ? "Система попросить підтвердити права адміністратора через PolicyKit."
      : "The system will request administrator authorization through PolicyKit.",
    detectedPlatform: uk ? "Визначена система" : "Detected system",
    commands: uk ? "Буде виконано такі команди" : "The following commands will be executed",
    cancel: uk ? "Скасувати" : "Cancel",
    confirm: uk ? "Запустити встановлення" : "Start installation",
    progressTitle: uk ? "Встановлення" : "Installing",
    successTitle: uk ? "Встановлення завершено" : "Installation completed",
    failedTitle: uk ? "Не вдалося встановити пакет" : "Package installation failed",
    close: uk ? "Закрити" : "Close",
  }

  async function saveNgrokToken() {
    setNgrokTokenBusy(true)
    setNgrokTokenStatus("")
    try {
      await invoke("set_ngrok_authtoken", { token: ngrokToken })
      setNgrokToken("")
      setNgrokTokenStatus(uk ? "Authtoken збережено." : "Authtoken saved.")
      setNgrokTokenEditing(false)
      await refresh()
    } catch (value) {
      setNgrokTokenStatus(errorMessage(value))
    } finally {
      setNgrokTokenBusy(false)
    }
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
      setInstallHint(uk ? "Cloudflare успішно авторизовано." : "Cloudflare authenticated.")
      await refresh()
    } catch (value) {
      setError(errorMessage(value))
    } finally {
      unlisten()
      setCloudflareAuthBusy(false)
      setCloudflareLoginUrl("")
    }
  }

  async function resetCloudflareAuth() {
    setCloudflareAuthBusy(true)
    setError("")
    try {
      await invoke("cloudflare_tunnel_reset")
      setInstallHint(uk ? "Авторизацію Cloudflare скинуто." : "Cloudflare authorization was reset.")
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
        hostname:
          provider === "cloudflare"
            ? cloudflareHostname
            : provider === "ngrok"
              ? ngrokHostname.trim() || null
              : null,
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
        : provider === "ngrok"
          ? Boolean(
              providerInstalled("ngrok") &&
              status?.providers.find((item) => item.id === "ngrok")?.authenticated,
            )
          : providerInstalled(provider)

  const startBlockedReason = (() => {
    if (!siteId) return uk ? "Немає доступних сайтів." : "No sites available."
    if (provider === "tailscale") {
      if (!status?.installed)
        return uk ? "Tailscale не встановлено." : "Tailscale is not installed."
      if (!status?.connected) return uk ? "Tailscale не підключено." : "Tailscale is not connected."
      if (!status.serveEnabled)
        return uk
          ? "Tailscale Serve ще не активовано для цього пристрою."
          : "Tailscale Serve is not enabled for this device yet."
    } else if (provider === "ngrok") {
      if (!providerInstalled("ngrok"))
        return uk ? "ngrok не встановлено." : "ngrok is not installed."
      if (!status?.providers.find((item) => item.id === "ngrok")?.authenticated)
        return uk
          ? "ngrok не авторизовано — введіть authtoken."
          : "ngrok is not authenticated — enter the authtoken."
    } else if (provider === "cloudflare") {
      if (!providerInstalled("cloudflare"))
        return uk ? "Cloudflare Tunnel не встановлено." : "Cloudflare Tunnel is not installed."
      if (!status?.providers.find((item) => item.id === "cloudflare")?.authenticated)
        return uk ? "Cloudflare не авторизовано." : "Cloudflare is not authenticated."
      if (!cloudflareHostname.trim())
        return uk ? "Вкажіть домен Cloudflare." : "Enter the Cloudflare hostname."
    }
    return ""
  })()

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
            {provider === "cloudflare" &&
              status?.providers.find((item) => item.id === "cloudflare")?.authenticated && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {uk ? "Базовий домен Cloudflare" : "Cloudflare base domain"}
                  </label>
                  <Input
                    value={cloudflareBaseDomain}
                    onChange={(event) => setCloudflareBaseDomain(event.target.value)}
                    placeholder="bewdes.studio"
                    spellCheck={false}
                  />
                  <p className="text-xs text-muted-foreground">
                    {uk
                      ? "Домен з вашого акаунту Cloudflare. Піддомен генерується автоматично з назви сайту."
                      : "A domain from your Cloudflare account. The subdomain is generated automatically from the site name."}
                  </p>
                  <label className="text-sm font-medium">
                    {uk ? "Домен Cloudflare для цього сайту" : "Cloudflare hostname for this site"}
                  </label>
                  <Input
                    value={cloudflareHostname}
                    onChange={(event) => setCloudflareHostname(event.target.value)}
                    placeholder="fce.bewdes.studio"
                    spellCheck={false}
                  />
                  <p className="text-xs text-muted-foreground">
                    {uk
                      ? "Автоматично: назва сайту + базовий домен. Можна змінити вручну. LSPanel створить іменований тунель, DNS-запис і локальний config.yml."
                      : "Auto-filled as site name + base domain. Editable if needed. LSPanel will create a named tunnel, DNS record, and local config.yml."}
                  </p>
                </div>
              )}
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
              {!busy && startBlockedReason && (
                <p className="w-full text-xs text-muted-foreground">{startBlockedReason}</p>
              )}
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
          <CardContent className="space-y-5">
            {installHint && <p className="text-xs text-muted-foreground">{installHint}</p>}

            {/* Tailscale */}
            {provider === "tailscale" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">Tailscale</span>
                  <Badge variant={status?.connected ? "default" : "secondary"}>
                    {status?.connected
                      ? uk
                        ? "Підключено"
                        : "Connected"
                      : uk
                        ? "Не підключено"
                        : "Disconnected"}
                  </Badge>
                </div>
                {status?.version && (
                  <p className="text-xs text-muted-foreground">Tailscale {status.version}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {uk
                    ? "Авторизація відбувається повністю через системний Tailscale (tailscale up), поза LSPanel — LSPanel лише читає стан. Serve/Funnel можуть один раз запросити operator-доступ (pkexec) і активацію Serve у вашому tailnet."
                    : "Authentication happens entirely through the system Tailscale (tailscale up), outside LSPanel — LSPanel only reads the state. Serve/Funnel may once require operator access (pkexec) and enabling Serve in your tailnet."}
                </p>
                {!status?.installed && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={Boolean(installingTool)}
                    onClick={() => void handleInstall("tailscale", PROVIDER_OPTIONS[0].installUrl)}
                  >
                    {installingTool === "tailscale"
                      ? uk
                        ? "Встановлення…"
                        : "Installing…"
                      : uk
                        ? "Встановити Tailscale"
                        : "Install Tailscale"}
                  </Button>
                )}
                {status?.connected && !status.serveEnabled && status.enableUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void invoke("open_url", { url: status.enableUrl })}
                  >
                    <ExternalLink />
                    {uk ? "Активувати Tailscale Serve" : "Enable Tailscale Serve"}
                  </Button>
                )}
              </div>
            )}

            {/* ngrok */}
            {provider === "ngrok" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">ngrok</span>
                  <Badge variant={providerInstalled("ngrok") ? "default" : "secondary"}>
                    {providerInstalled("ngrok")
                      ? status?.providers.find((item) => item.id === "ngrok")?.authenticated
                        ? uk
                          ? "Авторизовано"
                          : "Authenticated"
                        : uk
                          ? "Не авторизовано"
                          : "Not authenticated"
                      : uk
                        ? "Не знайдено"
                        : "Not found"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {uk
                    ? "Токен зберігається локально самим ngrok (~/.config/ngrok/ngrok.yml) — LSPanel лише його встановлює. На безкоштовному плані адреса завжди випадкова (напр. panama-starship-pants.ngrok-free.dev): кастомний домен вимагає платного плану ngrok."
                    : "The token is stored locally by ngrok itself (~/.config/ngrok/ngrok.yml) — LSPanel only sets it. On the free plan the address is always random (e.g. panama-starship-pants.ngrok-free.dev): a custom domain requires a paid ngrok plan."}
                </p>
                {!providerInstalled("ngrok") && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={Boolean(installingTool)}
                    onClick={() => void handleInstall("ngrok", PROVIDER_OPTIONS[1].installUrl)}
                  >
                    {installingTool === "ngrok"
                      ? uk
                        ? "Встановлення…"
                        : "Installing…"
                      : uk
                        ? "Встановити ngrok"
                        : "Install ngrok"}
                  </Button>
                )}
                {providerInstalled("ngrok") &&
                  (!status?.providers.find((item) => item.id === "ngrok")?.authenticated ||
                  ngrokTokenEditing ? (
                    <div className="space-y-2">
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
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {uk ? "Кастомний домен (опційно)" : "Custom domain (optional)"}
                        </span>
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0"
                          onClick={() => setNgrokTokenEditing(true)}
                        >
                          {uk ? "Змінити authtoken" : "Change authtoken"}
                        </Button>
                      </div>
                      <Input
                        value={ngrokHostname}
                        onChange={(event) => setNgrokHostname(event.target.value)}
                        placeholder="fce.ngrok-free.app"
                        spellCheck={false}
                      />
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0"
                        onClick={() =>
                          void invoke("open_url", { url: "https://dashboard.ngrok.com/domains" })
                        }
                      >
                        <ExternalLink />
                        {uk ? "Зарезервувати домен" : "Reserve a domain"}
                      </Button>
                    </div>
                  ))}
              </div>
            )}

            {/* Cloudflare */}
            {provider === "cloudflare" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">Cloudflare Tunnel</span>
                  <Badge variant={providerInstalled("cloudflare") ? "default" : "secondary"}>
                    {providerInstalled("cloudflare")
                      ? status?.providers.find((item) => item.id === "cloudflare")?.authenticated
                        ? uk
                          ? "Авторизовано"
                          : "Authenticated"
                        : uk
                          ? "Не авторизовано"
                          : "Not authenticated"
                      : uk
                        ? "Не знайдено"
                        : "Not found"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {uk
                    ? "Потрібен власний домен, підключений до вашого акаунту Cloudflare (DNS керується там). Авторизація відкриває браузер для вибору домену; після цього кастомні домени безкоштовні й без обмежень плану."
                    : "Requires your own domain connected to a Cloudflare account (DNS is managed there). Authenticating opens a browser to pick a domain; after that, custom domains are free with no plan restrictions."}
                </p>
                <p className="text-xs text-muted-foreground">
                  {uk
                    ? "Важливо: домен має бути делеговано на Cloudflare (NS-записи в реєстратора змінені на ті, що видає Cloudflare для цієї зони). Якщо домен лише додано в Cloudflare, а NS вказують на іншого провайдера (напр. реєстратора чи хостинг), створені записи існують тільки всередині Cloudflare й публічно не резолвляться — сайт буде недоступний, хоча тунель працює."
                    : "Important: the domain must be delegated to Cloudflare (its registrar's NS records changed to the ones Cloudflare issues for that zone). If the domain is only added in Cloudflare while NS still points elsewhere (e.g. the registrar or another host), the records it creates only exist inside Cloudflare and never resolve publicly — the site stays unreachable even though the tunnel itself is running."}
                </p>
                <p className="text-xs text-muted-foreground">
                  {uk
                    ? "Одна авторизація діє лише для однієї зони (домену), обраної в браузері під час входу. Щоб публікувати сайти на іншому домені, скиньте авторизацію нижче й увійдіть знову, обравши потрібний домен."
                    : "One authorization covers only the single zone (domain) picked in the browser at login time. To publish sites on a different domain, reset the authorization below and log in again, picking that domain."}
                </p>
                {!providerInstalled("cloudflare") && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={Boolean(installingTool)}
                    onClick={() => void handleInstall("cloudflare", PROVIDER_OPTIONS[2].installUrl)}
                  >
                    {installingTool === "cloudflare"
                      ? uk
                        ? "Встановлення…"
                        : "Installing…"
                      : uk
                        ? "Встановити Cloudflare Tunnel"
                        : "Install Cloudflare Tunnel"}
                  </Button>
                )}
                {providerInstalled("cloudflare") &&
                  !status?.providers.find((item) => item.id === "cloudflare")?.authenticated && (
                    <Button
                      variant="outline"
                      size="sm"
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
                  )}
                {cloudflareAuthBusy && (
                  <div className="space-y-2 rounded-lg border border-dashed p-3">
                    <p className="text-xs text-muted-foreground">
                      {uk
                        ? "Має відкритися вкладка браузера — увійдіть у Cloudflare й оберіть домен для авторизації. Якщо вкладка не відкрилась сама, скористайтесь посиланням нижче."
                        : "A browser tab should open — sign in to Cloudflare and pick a domain to authorize. If it didn't open on its own, use the link below."}
                    </p>
                    {cloudflareLoginUrl ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void invoke("open_url", { url: cloudflareLoginUrl })}
                      >
                        <ExternalLink />
                        {uk ? "Відкрити сторінку авторизації" : "Open the authorization page"}
                      </Button>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {uk ? "Отримання посилання…" : "Fetching the link…"}
                      </p>
                    )}
                  </div>
                )}
                {providerInstalled("cloudflare") &&
                  status?.providers.find((item) => item.id === "cloudflare")?.authenticated && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={cloudflareAuthBusy}
                      onClick={() => void resetCloudflareAuth()}
                    >
                      {uk ? "Скинути авторизацію" : "Reset authorization"}
                    </Button>
                  )}
              </div>
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
      <DependencyInstallDialog
        plan={pendingInstall}
        text={installerText}
        onClose={() => setPendingInstall(null)}
        onBusyChange={setInstallingTool}
        onInstalled={() => void handleInstalled()}
      />
    </div>
  )
}
