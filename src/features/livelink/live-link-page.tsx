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
import { pickLanguage } from "@/i18n"
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

export function LiveLinkPage({
  sites,
  states,
  language,
}: {
  sites: Site[]
  states: Record<string, string>
  language: string
}) {
  const text = pickLanguage(language).liveLink
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
    setInstallHint(text.installedHint)
    await refresh()
  }

  const installerText = text.installer

  async function saveNgrokToken() {
    setNgrokTokenBusy(true)
    setNgrokTokenStatus("")
    try {
      await invoke("set_ngrok_authtoken", { token: ngrokToken })
      setNgrokToken("")
      setNgrokTokenStatus(text.ngrokTokenSaved)
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
      setInstallHint(text.cloudflareAuthenticated)
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
      setInstallHint(text.cloudflareAuthReset)
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
    // Tailscale Serve can take a few seconds to come up after start(); the
    // backend samples status server-side and pushes each change here instead
    // of the frontend polling on a timer.
    const unlisten = listen<LiveLinkStatus>("livelink-status-changed", ({ payload }) =>
      setStatus(payload),
    )
    return () => void unlisten.then((stop) => stop())
  }, [status?.connected, status?.serveEnabled])

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

  const selectedSite = sites.find((site) => site.id === siteId)
  const siteRunning = Boolean(selectedSite && states[selectedSite.environmentId] === "running")

  const startBlockedReason = (() => {
    if (!siteId) return text.noSitesAvailable
    if (!siteRunning) return text.siteNotRunning
    if (provider === "tailscale") {
      if (!status?.installed) return text.tailscaleNotInstalled
      if (!status?.connected) return text.tailscaleNotConnected
      if (!status.serveEnabled) return text.tailscaleServeNotEnabled
    } else if (provider === "ngrok") {
      if (!providerInstalled("ngrok")) return text.ngrokNotInstalled
      if (!status?.providers.find((item) => item.id === "ngrok")?.authenticated)
        return text.ngrokNotAuthenticated
    } else if (provider === "cloudflare") {
      if (!providerInstalled("cloudflare")) return text.cloudflareNotInstalled
      if (!status?.providers.find((item) => item.id === "cloudflare")?.authenticated)
        return text.cloudflareNotAuthenticated
      if (!cloudflareHostname.trim()) return text.cloudflareHostnameRequired
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
        description={text.pageDescription}
        action={
          <Button variant="outline" disabled={busy} onClick={() => void refresh()}>
            <RefreshCw className={busy ? "animate-spin" : ""} />
            {text.refresh}
          </Button>
        }
      />
      <div className="grid gap-4 px-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)] lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>{text.shareSite}</CardTitle>
            <CardDescription>{text.shareSiteDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">{text.provider}</label>
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
                        {!info ? text.checking : info.installed ? text.installed : text.notFound}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{text.site}</label>
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
                  <label className="text-sm font-medium">{text.cloudflareBaseDomain}</label>
                  <Input
                    value={cloudflareBaseDomain}
                    onChange={(event) => setCloudflareBaseDomain(event.target.value)}
                    placeholder="bewdes.studio"
                    spellCheck={false}
                  />
                  <p className="text-xs text-muted-foreground">{text.cloudflareBaseDomainHint}</p>
                  <label className="text-sm font-medium">{text.cloudflareHostnameLabel}</label>
                  <Input
                    value={cloudflareHostname}
                    onChange={(event) => setCloudflareHostname(event.target.value)}
                    placeholder="fce.bewdes.studio"
                    spellCheck={false}
                  />
                  <p className="text-xs text-muted-foreground">{text.cloudflareHostnameHint}</p>
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
                  <div className="font-medium">{text.privateServe}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{text.privateServeHint}</div>
                </button>
                <button
                  type="button"
                  className={`rounded-xl border p-4 text-left transition-colors ${mode === "funnel" ? "border-amber-500 bg-amber-500/5" : "hover:bg-muted/50"}`}
                  onClick={() => setMode("funnel")}
                >
                  <Globe2 className="mb-3 size-5" />
                  <div className="font-medium">{text.publicFunnel}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{text.publicFunnelHint}</div>
                </button>
              </div>
            )}
            {provider === "tailscale" && mode === "funnel" && (
              <Alert>
                <AlertDescription>{text.funnelWarning}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy || !siteId || !siteRunning || !providerReady}
                onClick={() => void start()}
              >
                <Globe2 className={busy ? "animate-pulse" : ""} />
                {busy ? text.configuringLiveLink : status?.active ? text.addProject : text.start}
              </Button>
              {!busy && startBlockedReason && (
                <p className="w-full text-xs text-muted-foreground">{startBlockedReason}</p>
              )}
              {status?.active && (
                <Button variant="outline" disabled={busy} onClick={() => void stop()}>
                  <Unplug />
                  {text.stop}
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
                    {status?.connected ? text.connected : text.disconnected}
                  </Badge>
                </div>
                {status?.version && (
                  <p className="text-xs text-muted-foreground">Tailscale {status.version}</p>
                )}
                <p className="text-xs text-muted-foreground">{text.tailscaleAuthNote}</p>
                {!status?.installed && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={Boolean(installingTool)}
                    onClick={() => void handleInstall("tailscale", PROVIDER_OPTIONS[0].installUrl)}
                  >
                    {installingTool === "tailscale" ? text.installing : text.installTailscale}
                  </Button>
                )}
                {status?.connected && !status.serveEnabled && status.enableUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void invoke("open_url", { url: status.enableUrl })}
                  >
                    <ExternalLink />
                    {text.enableTailscaleServe}
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
                        ? text.authenticated
                        : text.notAuthenticated
                      : text.notFound}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{text.ngrokTokenNote}</p>
                {!providerInstalled("ngrok") && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={Boolean(installingTool)}
                    onClick={() => void handleInstall("ngrok", PROVIDER_OPTIONS[1].installUrl)}
                  >
                    {installingTool === "ngrok" ? text.installing : text.installNgrok}
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
                          {text.save}
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
                          {text.getAuthtoken}
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
                          {text.customDomainOptional}
                        </span>
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0"
                          onClick={() => setNgrokTokenEditing(true)}
                        >
                          {text.changeAuthtoken}
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
                        {text.reserveDomain}
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
                        ? text.authenticated
                        : text.notAuthenticated
                      : text.notFound}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{text.cloudflareTokenNote}</p>
                <p className="text-xs text-muted-foreground">{text.cloudflareDelegationNote}</p>
                <p className="text-xs text-muted-foreground">{text.cloudflareZoneNote}</p>
                {!providerInstalled("cloudflare") && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={Boolean(installingTool)}
                    onClick={() => void handleInstall("cloudflare", PROVIDER_OPTIONS[2].installUrl)}
                  >
                    {installingTool === "cloudflare" ? text.installing : text.installCloudflare}
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
                      {cloudflareAuthBusy ? text.waitingForAuth : text.authenticateCloudflare}
                    </Button>
                  )}
                {cloudflareAuthBusy && (
                  <div className="space-y-2 rounded-lg border border-dashed p-3">
                    <p className="text-xs text-muted-foreground">{text.cloudflareAuthTabNote}</p>
                    {cloudflareLoginUrl ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void invoke("open_url", { url: cloudflareLoginUrl })}
                      >
                        <ExternalLink />
                        {text.openAuthPage}
                      </Button>
                    ) : (
                      <p className="text-xs text-muted-foreground">{text.fetchingLink}</p>
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
                      {text.resetAuthorization}
                    </Button>
                  )}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{text.runningProjects}</CardTitle>
            <CardDescription>{text.runningProjectsDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            {status && activeLinks.length === 0 && (
              <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                {text.noRunningProjects}
              </div>
            )}
            {activeLinks.length > 0 && (
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{text.site}</TableHead>
                      <TableHead>{text.provider}</TableHead>
                      <TableHead>{text.modeColumn}</TableHead>
                      <TableHead>{text.statusColumn}</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead className="text-right">{text.actionsColumn}</TableHead>
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
                                  : text.tunnelMode}
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
                            {url ?? text.establishing}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!url}
                              onClick={() => url && void invoke("open_url", { url })}
                            >
                              <ExternalLink />
                              {text.open}
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
