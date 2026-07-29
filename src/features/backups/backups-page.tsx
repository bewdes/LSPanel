import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { ArchiveRestore, Database, FolderClock, HardDrive, RefreshCw } from "lucide-react"

import { PageHeading } from "@/components/page-heading"
import { pickLanguage } from "@/i18n"
import { backupsText } from "@/i18n/backups"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DatabaseBackups } from "@/features/backups/components/database-backups"
import type { DatabaseBackup } from "@/features/backups/types"
import { ProjectSnapshots } from "@/features/snapshots/components/project-snapshots"
import type { ProjectSnapshot } from "@/features/snapshots/types"
import { formatMetricBytes } from "@/lib/format"
import type { Environment, Site } from "@/types"

type Overview = {
  snapshots: number
  databaseBackups: number
  bytes: number
  protectedProjects: number
}

export function BackupsPage({
  sites,
  environments,
  uk,
}: {
  sites: Site[]
  environments: Environment[]
  uk: boolean
}) {
  const [siteId, setSiteId] = React.useState(sites[0]?.id ?? "")
  const [overview, setOverview] = React.useState<Overview | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const text = pickLanguage(backupsText, uk)
  const site = sites.find((item) => item.id === siteId)
  const environment = environments.find((item) => item.id === site?.environmentId)

  React.useEffect(() => {
    if (!sites.some((item) => item.id === siteId)) setSiteId(sites[0]?.id ?? "")
  }, [siteId, sites])

  const refresh = React.useCallback(async () => {
    setBusy(true)
    setError("")
    const snapshotRequests = sites.map((item) =>
      invoke<ProjectSnapshot[]>("list_project_snapshots", { siteId: item.id }).then((items) => ({
        siteId: item.id,
        items,
      })),
    )
    const backupRequests = environments
      .filter((item) => !["none", "sqlite", ""].includes(item.database.toLowerCase()))
      .map((item) =>
        invoke<DatabaseBackup[]>("list_database_backups", { environmentId: item.id }).then(
          (items) => ({ environmentId: item.id, items }),
        ),
      )
    const [snapshotResults, backupResults] = await Promise.all([
      Promise.allSettled(snapshotRequests),
      Promise.allSettled(backupRequests),
    ])
    const snapshots = snapshotResults.flatMap((result) =>
      result.status === "fulfilled" ? result.value.items : [],
    )
    const backups = backupResults.flatMap((result) =>
      result.status === "fulfilled" ? result.value.items : [],
    )
    const protectedIds = new Set([
      ...snapshotResults.flatMap((result) =>
        result.status === "fulfilled" && result.value.items.length ? [result.value.siteId] : [],
      ),
      ...backupResults.flatMap((result) => {
        if (result.status !== "fulfilled" || !result.value.items.length) return []
        return sites
          .filter((item) => item.environmentId === result.value.environmentId)
          .map((item) => item.id)
      }),
    ])
    setOverview({
      snapshots: snapshots.length,
      databaseBackups: backups.length,
      bytes:
        snapshots.reduce((total, item) => total + item.size, 0) +
        backups.reduce((total, item) => total + item.size, 0),
      protectedProjects: protectedIds.size,
    })
    const failures = [...snapshotResults, ...backupResults].filter(
      (result) => result.status === "rejected",
    )
    if (failures.length) setError(text.failedToReadStores(failures.length))
    setBusy(false)
  }, [environments, sites, text])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const stats = [
    {
      label: text.projectSnapshots,
      value: overview?.snapshots ?? "—",
      icon: FolderClock,
    },
    {
      label: text.databaseBackupsStat,
      value: overview?.databaseBackups ?? "—",
      icon: Database,
    },
    {
      label: text.storedData,
      value: overview ? formatMetricBytes(overview.bytes) : "—",
      icon: HardDrive,
    },
    {
      label: text.protectedProjects,
      value: overview ? `${overview.protectedProjects}/${sites.length}` : "—",
      icon: ArchiveRestore,
    },
  ]

  return (
    <div>
      <PageHeading
        title={text.backups}
        description={text.backupsDescription}
        action={
          <Button variant="outline" disabled={busy} onClick={() => void refresh()}>
            <RefreshCw className={busy ? "animate-spin" : ""} />
            {text.refresh}
          </Button>
        }
      />
      <div className="grid gap-4 px-4 pb-6 lg:px-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 xl:grid-cols-4">
          {stats.map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardContent className="flex items-center gap-3">
                <Icon className="size-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-lg font-semibold">{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {site ? (
          <>
            <Select value={siteId} onValueChange={(value) => value && setSiteId(value)}>
              <SelectTrigger className="w-full sm:w-80">
                <SelectValue placeholder={text.selectProject} />
              </SelectTrigger>
              <SelectContent>
                {sites.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} · {item.domain}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Tabs defaultValue="snapshots">
              <TabsList>
                <TabsTrigger value="snapshots">{text.projectSnapshotsTab}</TabsTrigger>
                <TabsTrigger value="database">{text.databaseBackupsTab}</TabsTrigger>
              </TabsList>
              <TabsContent value="snapshots" className="pt-4">
                <ProjectSnapshots site={site} uk={uk} onChanged={() => void refresh()} />
              </TabsContent>
              <TabsContent value="database" className="pt-4">
                {environment ? (
                  <DatabaseBackups
                    environment={environment}
                    uk={uk}
                    onChanged={() => void refresh()}
                  />
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center text-sm text-muted-foreground">
                      {text.noDatabaseEnvironment}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              {text.createOrImportProject}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
