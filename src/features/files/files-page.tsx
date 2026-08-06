import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import {
  ArrowLeft,
  Archive,
  ChevronRight,
  Container,
  Database,
  File,
  Files,
  Folder,
  FolderOpen,
  RefreshCw,
} from "lucide-react"

import { PageHeading } from "@/components/page-heading"
import { pickLanguage } from "@/i18n"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { ProjectFileManager } from "@/features/files/components/project-file-manager"
import type { Environment, Site } from "@/types"

export function FilesPage({
  sites,
  environments,
  language,
}: {
  sites: Site[]
  environments: Environment[]
  language: string
}) {
  const [siteId, setSiteId] = React.useState("")
  const [managed, setManaged] = React.useState<{
    scope: "container" | "database-backup" | "snapshot"
    resourceId: string
    title: string
  } | null>(null)
  const [overview, setOverview] = React.useState<Overview | null>(null)
  const [overviewBusy, setOverviewBusy] = React.useState(false)
  const text = pickLanguage(language).files
  const selectedSite = sites.find((site) => site.id === siteId)
  const loadOverview = React.useCallback(async () => {
    setOverviewBusy(true)
    try {
      setOverview(await invoke<Overview>("file_manager_overview"))
    } finally {
      setOverviewBusy(false)
    }
  }, [])

  React.useEffect(() => {
    if (siteId && !selectedSite) setSiteId("")
  }, [selectedSite, siteId])
  React.useEffect(() => {
    void loadOverview()
  }, [loadOverview])

  return (
    <div>
      <PageHeading
        title={text.files}
        description={
          selectedSite ? selectedSite.directory : managed ? managed.title : text.filesDescription
        }
        action={
          selectedSite || managed ? (
            <Button
              variant="outline"
              onClick={() => {
                setSiteId("")
                setManaged(null)
              }}
            >
              <ArrowLeft />
              {text.allSites}
            </Button>
          ) : (
            <Button variant="outline" disabled={overviewBusy} onClick={() => void loadOverview()}>
              <RefreshCw className={overviewBusy ? "animate-spin" : ""} />
              {text.refreshStatistics}
            </Button>
          )
        }
      />
      <div className="px-4 pb-6 lg:px-6">
        {selectedSite ? (
          <ProjectFileManager key={selectedSite.id} siteId={selectedSite.id} />
        ) : managed ? (
          <ManagedFileBrowser
            key={`${managed.scope}-${managed.resourceId}`}
            scope={managed.scope}
            resourceId={managed.resourceId}
            language={language}
          />
        ) : (
          <div className="grid gap-4">
            <FileStatistics overview={overview} loading={overviewBusy} language={language} />
            <Tabs defaultValue="sites">
              <TabsList>
                <TabsTrigger value="sites">
                  {text.sites}
                  <Badge variant="secondary">{sites.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="containers">
                  {text.containers}
                  <Badge variant="secondary">{environments.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="backups">
                  {text.backups}
                  <Badge variant="secondary">{sites.length + environments.length}</Badge>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="sites" className="pt-4">
                <FolderList
                  language={language}
                  empty={text.noSitesYet}
                  items={sites.map((site) => ({
                    id: site.id,
                    title: site.name,
                    description: site.domain,
                    detail: site.directory,
                    icon: Folder,
                    scope: "site",
                    resourceId: site.id,
                    onOpen: () => setSiteId(site.id),
                  }))}
                />
              </TabsContent>

              <TabsContent value="containers" className="pt-4">
                <FolderList
                  language={language}
                  empty={text.noContainersYet}
                  items={environments.map((environment) => ({
                    id: environment.id,
                    title: environment.name,
                    description: `${environment.webServer} · ${environment.database}`,
                    detail: environment.id,
                    icon: Container,
                    scope: "container",
                    resourceId: environment.id,
                    onOpen: () =>
                      setManaged({
                        scope: "container",
                        resourceId: environment.id,
                        title: environment.name,
                      }),
                  }))}
                />
              </TabsContent>

              <TabsContent value="backups" className="pt-4">
                <FolderList
                  language={language}
                  empty={text.noBackupDirectories}
                  items={[
                    ...sites.map((site) => ({
                      id: `snapshot-${site.id}`,
                      title: `${site.name} ${text.snapshotsSuffix}`,
                      description: text.projectSnapshots,
                      detail: site.domain,
                      icon: Archive,
                      scope: "snapshot",
                      resourceId: site.id,
                      onOpen: () =>
                        setManaged({
                          scope: "snapshot",
                          resourceId: site.id,
                          title: `${site.name} ${text.snapshotsSuffix}`,
                        }),
                    })),
                    ...environments.map((environment) => ({
                      id: `database-${environment.id}`,
                      title: `${environment.name} ${text.databaseSuffix}`,
                      description: text.databaseBackups,
                      detail: `${environment.database} ${environment.databaseVersion}`,
                      icon: Archive,
                      scope: "database-backup",
                      resourceId: environment.id,
                      onOpen: () =>
                        setManaged({
                          scope: "database-backup",
                          resourceId: environment.id,
                          title: `${environment.name} ${text.databaseBackupsSuffix}`,
                        }),
                    })),
                  ]}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  )
}

type Usage = { bytes: number; files: number; directories: number }
type Overview = { sites: Usage; containers: Usage; backups: Usage }

function FileStatistics({
  overview,
  loading,
  language,
}: {
  overview: Overview | null
  loading: boolean
  language: string
}) {
  const totalFiles = overview
    ? overview.sites.files + overview.containers.files + overview.backups.files
    : 0
  const totalBytes = overview
    ? overview.sites.bytes + overview.containers.bytes + overview.backups.bytes
    : 0
  const text = pickLanguage(language).files
  const cards = [
    {
      label: text.sites,
      value: overview ? formatSize(overview.sites.bytes) : "—",
      detail: overview ? `${overview.sites.files} ${text.filesUnit}` : "—",
      icon: Folder,
    },
    {
      label: text.containers,
      value: overview ? formatSize(overview.containers.bytes) : "—",
      detail: overview ? `${overview.containers.files} ${text.filesUnit}` : "—",
      icon: Container,
    },
    {
      label: text.backups,
      value: overview ? formatSize(overview.backups.bytes) : "—",
      detail: overview ? `${overview.backups.files} ${text.filesUnit}` : "—",
      icon: Database,
    },
    {
      label: text.totalFiles,
      value: overview ? totalFiles.toLocaleString() : "—",
      detail: overview ? formatSize(totalBytes) : loading ? text.calculating : "—",
      icon: Files,
    },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(({ label, value, detail, icon: Icon }) => (
        <Card key={label} className="py-2">
          <CardContent className="flex items-center gap-3 px-4 py-0">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
              <Icon className="size-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="truncate text-xl font-semibold">{value}</p>
              <p className="truncate text-xs text-muted-foreground">{detail}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

type ManagedEntry = {
  name: string
  path: string
  directory: boolean
  size: number
}

function ManagedFileBrowser({
  scope,
  resourceId,
  language,
}: {
  scope: "container" | "database-backup" | "snapshot"
  resourceId: string
  language: string
}) {
  const text = pickLanguage(language).files
  const [directory, setDirectory] = React.useState("")
  const [entries, setEntries] = React.useState<ManagedEntry[]>([])
  const [file, setFile] = React.useState<{ path: string; text: string } | null>(null)
  const [message, setMessage] = React.useState("")

  const load = React.useCallback(
    async (path: string) => {
      setMessage("")
      try {
        setEntries(
          await invoke<ManagedEntry[]>("list_managed_files", {
            scope,
            resourceId,
            path,
          }),
        )
        setDirectory(path)
      } catch (error) {
        setMessage(String(error))
      }
    },
    [resourceId, scope],
  )

  React.useEffect(() => {
    void load("")
  }, [load])

  const openEntry = async (entry: ManagedEntry) => {
    if (entry.directory) {
      setFile(null)
      await load(entry.path)
      return
    }
    setMessage("")
    try {
      setFile(
        await invoke<{ path: string; text: string }>("read_managed_file", {
          scope,
          resourceId,
          path: entry.path,
        }),
      )
    } catch (error) {
      setMessage(String(error))
    }
  }

  const crumbs = directory ? directory.split("/") : []
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.8fr)_minmax(420px,1.2fr)]">
      <Card>
        <CardContent className="grid gap-3 pt-4">
          <div className="flex flex-wrap items-center gap-1 text-sm">
            <Button variant="ghost" size="sm" onClick={() => void load("")}>
              {text.root}
            </Button>
            {crumbs.map((crumb, index) => (
              <React.Fragment key={`${crumb}-${index}`}>
                <ChevronRight className="size-3 text-muted-foreground" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void load(crumbs.slice(0, index + 1).join("/"))}
                >
                  {crumb}
                </Button>
              </React.Fragment>
            ))}
          </div>
          <div className="max-h-[560px] overflow-auto rounded-lg border">
            {entries.map((entry) => (
              <button
                key={entry.path}
                className="flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted"
                onClick={() => void openEntry(entry)}
              >
                {entry.directory ? <Folder className="size-4" /> : <File className="size-4" />}
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                {!entry.directory && (
                  <span className="text-xs text-muted-foreground">{formatSize(entry.size)}</span>
                )}
              </button>
            ))}
            {!entries.length && (
              <p className="p-8 text-center text-sm text-muted-foreground">
                {text.managedDirEmpty}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <p className="mb-3 truncate text-sm font-medium">
            {file?.path ?? text.filePreviewFallback}
          </p>
          <Textarea
            readOnly
            className="min-h-[540px] resize-y font-mono text-xs"
            value={file?.text ?? ""}
            placeholder={text.selectFileToPreview}
          />
        </CardContent>
      </Card>
      {message && (
        <Alert variant="destructive" className="xl:col-span-2">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

function FolderList({
  items,
  empty,
  language,
}: {
  items: Array<{
    id: string
    title: string
    description: string
    detail: string
    icon: React.ComponentType<{ className?: string }>
    scope: string
    resourceId: string
    onOpen?: () => void
  }>
  empty: string
  language: string
}) {
  const text = pickLanguage(language).files
  const [details, setDetails] = React.useState<
    Record<string, { bytes: number; files: number; directories: number; permissions?: string }>
  >({})
  const signature = items.map((item) => `${item.scope}:${item.resourceId}`).join("|")

  React.useEffect(() => {
    let active = true
    void Promise.all(
      items.map(async (item) => {
        try {
          const value = await invoke<{
            bytes: number
            files: number
            directories: number
            permissions?: string
          }>("file_manager_folder_details", {
            scope: item.scope,
            resourceId: item.resourceId,
          })
          return [item.id, value] as const
        } catch {
          return [item.id, null] as const
        }
      }),
    ).then((values) => {
      if (!active) return
      const next: typeof details = {}
      for (const [id, value] of values) if (value) next[id] = value
      setDetails(next)
    })
    return () => {
      active = false
    }
  }, [signature]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!items.length)
    return (
      <Card>
        <CardContent className="grid min-h-56 place-items-center text-center">
          <div>
            <FolderOpen className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="font-medium">{empty}</p>
          </div>
        </CardContent>
      </Card>
    )

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {items.map(({ id, title, description, detail, icon: Icon, onOpen }) => (
        <button
          key={id}
          type="button"
          disabled={!onOpen}
          onDoubleClick={onOpen}
          onClick={onOpen}
          className="group flex w-full min-w-0 items-center gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 enabled:hover:bg-muted/60 disabled:cursor-default disabled:opacity-100"
        >
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
            <Icon className="size-5 fill-current text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{title}</p>
            <p className="truncate text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="max-w-[48%] shrink-0 text-right text-xs text-muted-foreground">
            <p className="hidden truncate sm:block">{detail}</p>
            <p className="truncate">
              {details[id]
                ? text.filesCountLabel(
                    details[id].files,
                    details[id].permissions ?? "—",
                    formatSize(details[id].bytes),
                  )
                : text.calculating}
            </p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </button>
      ))}
    </div>
  )
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
