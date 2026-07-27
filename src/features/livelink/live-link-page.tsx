import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { ExternalLink, Globe2, LockKeyhole, RefreshCw, Unplug } from "lucide-react"

import { PageHeading } from "@/components/page-heading"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import type { Site } from "@/types"

type LiveLinkStatus = {
  installed: boolean
  connected: boolean
  serveEnabled: boolean
  version?: string
  dnsName?: string
  enableUrl?: string
  active: boolean
  siteId?: string
  mode?: "serve" | "funnel"
  url?: string
  links: Array<{
    siteId: string
    mode: "serve" | "funnel"
    port: number
    localPort: number
    tailscaleActive: boolean
    gatewayActive: boolean
    projectReachable: boolean
    status:
      | "active"
      | "orphaned"
      | "gateway_unavailable"
      | "project_unavailable"
      | "tailscale_inactive"
  }>
  message: string
}

export function LiveLinkPage({ sites, uk }: { sites: Site[]; uk: boolean }) {
  const [status, setStatus] = React.useState<LiveLinkStatus | null>(null)
  const [siteId, setSiteId] = React.useState(sites[0]?.id ?? "")
  const [mode, setMode] = React.useState<"serve" | "funnel">("serve")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const initialized = React.useRef(false)

  // Picks the first site that isn't already published, so the form is ready
  // to add the *next* project instead of re-selecting one that's running.
  const nextUnlinkedSite = React.useCallback(
    (links: LiveLinkStatus["links"]) => {
      const linked = new Set(links.map((link) => link.siteId))
      return sites.find((site) => !linked.has(site.id))?.id ?? sites[0]?.id ?? ""
    },
    [sites],
  )

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
        if (next.mode) setMode(next.mode)
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
      const next = await invoke<LiveLinkStatus>("start_livelink", { siteId, mode })
      setStatus(next)
      setSiteId(nextUnlinkedSite(next.links))
    } catch (value) {
      setError(errorMessage(value))
    } finally {
      setBusy(false)
    }
  }

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
            ? "Безпечно відкривайте локальний сайт через Tailscale."
            : "Securely expose a local site through Tailscale."
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
            {!status?.installed && (
              <Alert>
                <AlertDescription>
                  {uk
                    ? "Tailscale CLI не знайдено. Встановіть Tailscale та увійдіть у свій tailnet."
                    : "Tailscale CLI was not found. Install Tailscale and sign in to your tailnet."}
                </AlertDescription>
              </Alert>
            )}
            {status?.connected && !status.serveEnabled && status.enableUrl && (
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
            {mode === "funnel" && (
              <Alert>
                <AlertDescription>
                  {uk
                    ? "Увага: Funnel робить поточну версію сайту загальнодоступною."
                    : "Warning: Funnel makes the current site publicly accessible."}
                </AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy || !siteId || !status?.connected || !status.serveEnabled}
                onClick={() => void start()}
              >
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
                ? "Сайти, доступні через поточний Tailscale-пристрій."
                : "Sites available through the current Tailscale device."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {status && status.links.length === 0 && (
              <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                {uk
                  ? "Ще немає проєктів, запущених через LiveLink."
                  : "No projects are currently running through LiveLink."}
              </div>
            )}
            {status?.dnsName && status.links.length > 0 && (
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{uk ? "Сайт" : "Site"}</TableHead>
                      <TableHead>{uk ? "Режим" : "Mode"}</TableHead>
                      <TableHead>{uk ? "Порт" : "Port"}</TableHead>
                      <TableHead>Gateway</TableHead>
                      <TableHead>{uk ? "Стан" : "Status"}</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead className="text-right">{uk ? "Дії" : "Actions"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {status.links.map((link) => {
                      const site = sites.find((item) => item.id === link.siteId)
                      const url = `https://${status.dnsName}${link.port === 443 ? "" : `:${link.port}`}`
                      return (
                        <TableRow key={link.siteId}>
                          <TableCell>
                            <p className="font-medium">{site?.name ?? link.siteId}</p>
                            {site?.domain && (
                              <p className="text-xs text-muted-foreground">{site.domain}</p>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={link.mode === "funnel" ? "destructive" : "outline"}>
                              {link.mode === "funnel" ? "Public Funnel" : "Private Serve"}
                            </Badge>
                          </TableCell>
                          <TableCell>{link.port}</TableCell>
                          <TableCell>{link.localPort}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant={link.projectReachable ? "outline" : "destructive"}>
                                Project
                              </Badge>
                              <Badge variant={link.gatewayActive ? "outline" : "destructive"}>
                                Gateway
                              </Badge>
                              <Badge variant={link.tailscaleActive ? "outline" : "destructive"}>
                                Tailscale
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-64 truncate text-xs text-muted-foreground">
                            {url}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void invoke("open_url", { url })}
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
