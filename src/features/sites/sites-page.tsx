import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { open as openDialog } from "@tauri-apps/plugin-dialog"
import {
  Archive,
  Code2,
  Copy,
  ExternalLink,
  Folder,
  GitBranch,
  Pin,
  Play,
  Plus,
  Server,
  ShieldCheck,
  ShieldAlert,
  Square,
  Terminal,
  Upload,
  MoreHorizontal,
} from "lucide-react"

import { PageHeading } from "@/components/page-heading"
import { pickLanguage } from "@/i18n"
import { errorMessage } from "@/lib/errors"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Environment, Site } from "@/types"
import type { ServiceResource } from "@/features/dashboard/types"
import { formatMetricBytes, parseMetricBytes } from "@/lib/format"

type GitStatus = { branch: string }
type HealthReport = { checks: Array<{ code: string; status: string }> }

export function SitesPage({
  language,
  sites,
  environments,
  states,
  statsRefreshIntervalSeconds,
  onCreate,
  onSelect,
  onOperate,
  onImported,
}: {
  language: string
  sites: Site[]
  environments: Environment[]
  states: Record<string, string>
  statsRefreshIntervalSeconds: number
  onCreate: () => void
  onSelect: (id: string) => void
  onOperate: (id: string, action: "start" | "stop") => void
  onImported: (id: string) => void
}) {
  const [showArchived, setShowArchived] = React.useState(false)
  const [groupFilter, setGroupFilter] = React.useState("all")
  const [tagFilter, setTagFilter] = React.useState("all")
  const [resources, setResources] = React.useState<Record<string, ServiceResource[]>>({})
  const [branches, setBranches] = React.useState<Record<string, string>>({})
  const [httpsTrusted, setHttpsTrusted] = React.useState(false)
  const [importOpen, setImportOpen] = React.useState(false)
  const [importSource, setImportSource] = React.useState("")
  const [importName, setImportName] = React.useState("")
  const [importDomain, setImportDomain] = React.useState("")
  const [importBusy, setImportBusy] = React.useState(false)
  const [importError, setImportError] = React.useState("")
  const [importProgress, setImportProgress] = React.useState<{
    progress: number
    stage: string
  } | null>(null)
  const text = pickLanguage(language).sites
  const chooseImportBundle = async () => {
    const selected = await openDialog({ directory: true, multiple: false })
    if (typeof selected !== "string") return
    setImportSource(selected)
  }
  async function importProject() {
    setImportBusy(true)
    setImportError("")
    setImportProgress({ progress: 0, stage: "" })
    const unlisten = await listen<{ kind: string; progress: number; stage: string }>(
      "operation-progress",
      ({ payload }) => {
        if (payload.kind !== "project-import") return
        setImportProgress({ progress: payload.progress, stage: payload.stage })
      },
    )
    try {
      const created = await invoke<Site[]>("import_project_bundle", {
        source: importSource,
        name: importName,
        domain: importDomain,
      })
      const imported = created.find((site) => site.name === importName)
      setImportOpen(false)
      setImportSource("")
      setImportName("")
      setImportDomain("")
      if (imported) onImported(imported.id)
    } catch (error) {
      setImportError(errorMessage(error))
    } finally {
      unlisten()
      setImportProgress(null)
      setImportBusy(false)
    }
  }
  React.useEffect(() => {
    let disposed = false
    const load = async () => {
      const [resourceEntries, branchEntries, health] = await Promise.all([
        Promise.all(
          environments.map(
            async (environment) =>
              [
                environment.id,
                await invoke<ServiceResource[]>("environment_resources", {
                  id: environment.id,
                }).catch(() => []),
              ] as const,
          ),
        ),
        Promise.all(
          sites.map(
            async (site) =>
              [
                site.id,
                (
                  await invoke<GitStatus>("site_git_status", {
                    directory: `${site.directory}/app`,
                  }).catch(() => null)
                )?.branch ?? "",
              ] as const,
          ),
        ),
        invoke<HealthReport>("system_health").catch(() => null),
      ])
      if (!disposed) {
        setResources(Object.fromEntries(resourceEntries))
        setBranches(Object.fromEntries(branchEntries))
        setHttpsTrusted(
          health?.checks.some((check) => check.code === "LOCAL_CA" && check.status === "healthy") ??
            false,
        )
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), statsRefreshIntervalSeconds * 1000)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [environments, sites, statsRefreshIntervalSeconds])
  const byId = new Map(environments.map((item) => [item.id, item]))
  const groups = [
    ...new Set(
      sites.map((site) => site.group?.trim()).filter((value): value is string => Boolean(value)),
    ),
  ].sort()
  const tags = [...new Set(sites.flatMap((site) => site.tags ?? []))].sort()
  const visible = sites
    .filter(
      (site) =>
        (showArchived || !site.archived) &&
        (groupFilter === "all" || site.group === groupFilter) &&
        (tagFilter === "all" || site.tags?.includes(tagFilter)),
    )
    .sort(
      (a, b) =>
        Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || a.name.localeCompare(b.name),
    )
  return (
    <div>
      <PageHeading
        title={text.localSites}
        description={text.localSitesDescription}
        action={
          <div className="flex gap-2">
            <Button
              variant={showArchived ? "secondary" : "outline"}
              onClick={() => setShowArchived((value) => !value)}
            >
              <Archive />
              {text.archive}
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload />
              {text.importProject}
            </Button>
            <Button onClick={onCreate}>
              <Plus />
              {text.newSite}
            </Button>
          </div>
        }
      />
      <div className="grid gap-3 px-4 lg:px-6">
        <div className="flex flex-wrap gap-2">
          {groups.length > 0 && (
            <Select value={groupFilter} onValueChange={(value) => setGroupFilter(value ?? "all")}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{text.allGroups}</SelectItem>
                {groups.map((group) => (
                  <SelectItem key={group} value={group}>
                    {group}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {tags.length > 0 && (
            <Select value={tagFilter} onValueChange={(value) => setTagFilter(value ?? "all")}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{text.allTags}</SelectItem>
                {tags.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-11 px-4">{text.siteColumn}</TableHead>
                <TableHead className="h-11">{text.stackColumn}</TableHead>
                <TableHead className="h-11">{text.resourcesColumn}</TableHead>
                <TableHead className="h-11">{text.statusColumn}</TableHead>
                <TableHead className="h-11 px-4 text-right">{text.actionsColumn}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((site) => {
                const environment = byId.get(site.environmentId)
                const siteRunning =
                  states[site.environmentId] === "running" && site.enabled !== false
                const services = resources[site.environmentId] ?? []
                const activeServices = services.filter((service) =>
                  /running|up/i.test(service.state),
                )
                const cpu = services.reduce(
                  (total, service) => total + (Number.parseFloat(service.cpu) || 0),
                  0,
                )
                const memory = services.reduce(
                  (total, service) => total + parseMetricBytes(service.memory.split("/")[0] ?? ""),
                  0,
                )
                const isNative = environment?.runtimeMode === "native"
                const siteUrl = isNative
                  ? `http://127.0.0.1:${environment?.port ?? ""}`
                  : `https://${site.domain}`
                return (
                  <TableRow
                    key={site.id}
                    className="cursor-pointer"
                    onClick={() => onSelect(site.id)}
                  >
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted">
                          <Server className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <span className="flex items-center gap-1 font-medium">
                            {site.pinned && <Pin className="size-3 shrink-0" />}
                            <span className="truncate">{site.name}</span>
                            {isNative && <Badge variant="outline">{text.nativeBadge}</Badge>}
                          </span>
                          <p className="truncate text-xs text-muted-foreground">
                            {isNative ? `127.0.0.1:${environment?.port ?? ""}` : site.domain}
                          </p>
                          <p
                            className="max-w-80 truncate text-xs text-muted-foreground"
                            title={site.directory}
                          >
                            {site.directory}
                          </p>
                          {Boolean(site.group || site.tags?.length) && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {site.group && <Badge variant="outline">{site.group}</Badge>}
                              {site.tags?.map((tag) => (
                                <Badge key={tag} variant="secondary">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{environment?.name ?? "—"}</p>
                      {environment && (
                        <p className="text-xs text-muted-foreground">
                          {site.projectType ?? "php"} ·{" "}
                          {site.projectType === "node" || site.projectType === "react"
                            ? `Node.js ${environment.nodeVersion}`
                            : `${environment.webServer} · PHP ${environment.phpVersion}`}
                        </p>
                      )}
                      {environment && (
                        <p className="text-xs text-muted-foreground">
                          {environment.database} {environment.databaseVersion}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium tabular-nums">
                        {cpu.toFixed(2)}% · {formatMetricBytes(memory)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {activeServices.length} {text.activeServices}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant={siteRunning ? "default" : "secondary"}>
                          {siteRunning ? "running" : "stopped"}
                        </Badge>
                        {!isNative && (
                          <Badge variant={httpsTrusted ? "outline" : "secondary"}>
                            {httpsTrusted ? <ShieldCheck /> : <ShieldAlert />}
                            SSL
                          </Badge>
                        )}
                      </div>
                      {branches[site.id] && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <GitBranch className="size-3" /> {branches[site.id]}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {site.lastStartedAt
                          ? `${text.started}: ${new Date(site.lastStartedAt * 1000).toLocaleString()}`
                          : text.notStartedYet}
                      </p>
                    </TableCell>
                    <TableCell className="px-4 text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={siteRunning ? text.stop : text.start}

                        onClick={(event) => {
                          event.stopPropagation()
                          onOperate(site.id, siteRunning ? "stop" : "start")
                        }}
                      >
                        {siteRunning ? <Square /> : <Play />}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(event) => event.stopPropagation()}
                            />
                          }
                        >
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-50"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <DropdownMenuItem
                            onClick={(event) => {
                              event.stopPropagation()
                              invoke("open_url", { url: siteUrl })
                            }}
                          >
                            <ExternalLink />
                            {text.openSite}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(event) => {
                              event.stopPropagation()
                              invoke("open_editor", { path: site.directory })
                            }}
                          >
                            <Code2 />
                            {text.openInEditor}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(event) => {
                              event.stopPropagation()
                              invoke("open_terminal", { path: site.directory })
                            }}
                          >
                            <Terminal />
                            {text.terminal}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(event) => {
                              event.stopPropagation()
                              invoke("open_path", { path: site.directory })
                            }}
                          >
                            <Folder />
                            {text.openFolder}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(event) => {
                              event.stopPropagation()
                              void navigator.clipboard.writeText(siteUrl)
                            }}
                          >
                            <Copy />
                            {text.copyUrl}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          {!visible.length && (
            <div className="grid place-items-center gap-3 py-20 text-muted-foreground">
              <Server className="size-8" />
              <p>{text.noSitesYet}</p>
              <Button onClick={onCreate}>
                <Plus />
                {text.create}
              </Button>
            </div>
          )}
        </Card>
      </div>
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{text.importProject}</DialogTitle>
            <DialogDescription>{text.importProjectDescription}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            {importError && (
              <Alert variant="destructive">
                <AlertDescription>{importError}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-2">
              <Label>{text.importBundleFolder}</Label>
              <Button variant="outline" onClick={() => void chooseImportBundle()}>
                <Folder />
                {importSource || text.chooseBundleFolder}
              </Button>
            </div>
            <div className="grid gap-2">
              <Label>{text.newName}</Label>
              <Input
                value={importName}
                onChange={(event) => {
                  setImportName(event.target.value)
                  setImportDomain(
                    `${event.target.value.toLowerCase().replace(/_/g, "-")}.localhost`,
                  )
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label>{text.newDomain}</Label>
              <Input
                value={importDomain}
                onChange={(event) => setImportDomain(event.target.value.toLowerCase())}
              />
            </div>
          </div>
          {importProgress && (
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="truncate">{importProgress.stage}</span>
                <span className="shrink-0 tabular-nums">{importProgress.progress}%</span>
              </div>
              <Progress value={importProgress.progress} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={importBusy} onClick={() => setImportOpen(false)}>
              {text.cancel}
            </Button>
            <Button
              disabled={importBusy || !importSource || !importName || !importDomain}
              onClick={() => void importProject()}
            >
              {importBusy ? text.importing : text.importProject}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
