import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog"
import {
  ArrowLeft,
  Copy,
  Database,
  Download,
  Eraser,
  ExternalLink,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Upload,
} from "lucide-react"

import { Credential } from "@/components/credential"
import { PageHeading } from "@/components/page-heading"
import { errorMessage } from "@/lib/errors"
import { pickLanguage } from "@/i18n"
import { databaseText } from "@/i18n/database"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DatabaseBackups } from "@/features/backups/components/database-backups"
import { DatabaseConsole } from "@/features/database/components/database-console"
import { serviceHostname } from "@/lib/format"
import type { Environment, Site } from "@/types"

type DatabaseEntry = {
  name: string
  size: string
  connections: number
  configured: boolean
  system: boolean
}

type Overview = { size: string; connections: number; connected: boolean }

export function DatabasePage({
  environments,
  sites,
  uk,
}: {
  environments: Environment[]
  sites: Site[]
  uk: boolean
}) {
  const text = pickLanguage(databaseText, uk)
  const [selectedId, setSelectedId] = React.useState("")
  const [overview, setOverview] = React.useState<Record<string, Overview>>({})

  const refreshOverview = React.useCallback(async () => {
    const entries = await Promise.all(
      environments.map(async (environment) => {
        try {
          const databases = await invoke<DatabaseEntry[]>("list_databases", {
            environmentId: environment.id,
          })
          const configured = databases.find((database) => database.configured)
          return [
            environment.id,
            {
              size: configured?.size ?? "—",
              connections: configured?.connections ?? 0,
              connected: true,
            },
          ] as const
        } catch {
          return [environment.id, { size: "—", connections: 0, connected: false }] as const
        }
      }),
    )
    setOverview(Object.fromEntries(entries))
  }, [environments])

  React.useEffect(() => {
    void refreshOverview()
  }, [refreshOverview])

  const selected = environments.find((environment) => environment.id === selectedId)
  if (selected) {
    return (
      <DatabaseDetails
        environment={selected}
        siteNames={sites
          .filter((site) => site.environmentId === selected.id)
          .map((site) => site.name)}
        uk={uk}
        onBack={() => {
          setSelectedId("")
          void refreshOverview()
        }}
      />
    )
  }

  return (
    <div>
      <PageHeading
        title={text.databases}
        description={text.databasesDescription}
        action={
          <Button variant="outline" onClick={() => void refreshOverview()}>
            <RefreshCw /> {text.refresh}
          </Button>
        }
      />
      <div className="px-4 lg:px-6">
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{text.siteColumn}</TableHead>
                <TableHead>{text.databaseColumn}</TableHead>
                <TableHead>{text.engineColumn}</TableHead>
                <TableHead>{text.sizeColumn}</TableHead>
                <TableHead>{text.connectionsColumn}</TableHead>
                <TableHead>{text.statusColumn}</TableHead>
                <TableHead>{text.adminClientColumn}</TableHead>
                <TableHead className="text-right">{text.actionsColumn}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {environments.map((environment) => {
                const relatedSites = sites.filter((site) => site.environmentId === environment.id)
                const services = environment.extraServices ?? []
                const admin = services.includes("phpmyadmin")
                  ? "phpMyAdmin"
                  : services.includes("adminer")
                    ? "Adminer"
                    : ""
                const status = overview[environment.id]
                return (
                  <TableRow key={environment.id}>
                    <TableCell>
                      <p className="font-medium">
                        {relatedSites.map((site) => site.name).join(", ") || environment.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {relatedSites.map((site) => site.domain).join(", ") || text.noLinkedSite}
                      </p>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {environment.databaseName ?? "app"}
                    </TableCell>
                    <TableCell>
                      {environment.database} {environment.databaseVersion}
                    </TableCell>
                    <TableCell>{status?.size ?? text.checkingEllipsis}</TableCell>
                    <TableCell>{status?.connections ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={status?.connected ? "default" : "secondary"}>
                        {status
                          ? status.connected
                            ? text.connected
                            : text.unavailable
                          : text.checking}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {admin ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            void invoke("open_url", {
                              url: `https://${serviceHostname(admin.toLowerCase(), environment.name)}`,
                            })
                          }
                        >
                          {admin} <ExternalLink />
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">{text.notEnabled}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedId(environment.id)}
                      >
                        <Pencil /> {text.edit}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          {environments.length === 0 && (
            <div className="grid place-items-center gap-2 py-16 text-muted-foreground">
              <Database className="size-8" />
              <p className="text-sm">{text.noDatabasesYet}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DatabaseDetails({
  environment,
  siteNames,
  uk,
  onBack,
}: {
  environment: Environment
  siteNames: string[]
  uk: boolean
  onBack: () => void
}) {
  const text = pickLanguage(databaseText, uk)
  const [databases, setDatabases] = React.useState<DatabaseEntry[]>([])
  const [name, setName] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState("")
  const [messageOk, setMessageOk] = React.useState(false)
  const [deleteName, setDeleteName] = React.useState("")
  const [clearOpen, setClearOpen] = React.useState(false)
  const [cloneSource, setCloneSource] = React.useState("")
  const [cloneTarget, setCloneTarget] = React.useState("")
  const [renameSource, setRenameSource] = React.useState("")
  const [renameTarget, setRenameTarget] = React.useState("")

  const load = React.useCallback(async () => {
    setBusy(true)
    setMessage("")
    try {
      setDatabases(
        await invoke<DatabaseEntry[]>("list_databases", { environmentId: environment.id }),
      )
    } catch (value) {
      setMessage(errorMessage(value))
      setMessageOk(false)
    } finally {
      setBusy(false)
    }
  }, [environment.id])

  React.useEffect(() => {
    void load()
  }, [load])

  const create = async () => {
    if (!name.trim()) return
    try {
      await action("create_database", { name: name.trim() }, text.databaseCreated)
      setName("")
      await load()
    } catch {
      // action already exposes the backend error in the page alert.
    }
  }

  const action = async (
    command: string,
    payload: Record<string, string> = {},
    success = text.operationCompleted,
  ) => {
    setBusy(true)
    setMessage("")
    try {
      await invoke(command, { environmentId: environment.id, ...payload })
      setMessage(success)
      setMessageOk(true)
    } catch (value) {
      setMessage(errorMessage(value))
      setMessageOk(false)
      throw value
    } finally {
      setBusy(false)
    }
  }

  const importSql = async () => {
    const path = await openDialog({
      title: text.importSqlInto(environment.name),
      multiple: false,
      directory: false,
      filters: [{ name: "SQL dump", extensions: ["sql"] }],
    })
    if (path)
      await action("import_database_file", { path }, text.databaseImported).catch(() => undefined)
  }

  const exportSql = async () => {
    const path = await saveDialog({
      title: text.exportDatabase(environment.name),
      defaultPath: `${environment.databaseName ?? "database"}.sql`,
      filters: [{ name: "SQL dump", extensions: ["sql"] }],
    })
    if (path)
      await action("export_database_file", { path }, text.databaseExported).catch(() => undefined)
  }

  const clone = async () => {
    if (!cloneSource || !cloneTarget.trim()) return
    try {
      await action(
        "clone_database",
        { source: cloneSource, target: cloneTarget.trim() },
        text.databaseCloned,
      )
      setCloneSource("")
      setCloneTarget("")
      await load()
    } catch {
      // action already exposes the backend error in the page alert.
    }
  }

  const rename = async () => {
    if (!renameSource || !renameTarget.trim()) return
    try {
      await action(
        "rename_database",
        { source: renameSource, target: renameTarget.trim() },
        text.databaseRenamed,
      )
      setRenameSource("")
      setRenameTarget("")
      await load()
    } catch {
      // action already exposes the backend error in the page alert.
    }
  }

  const services = environment.extraServices ?? []
  return (
    <div className="grid gap-6 px-4 pb-8 lg:px-6">
      <div className="flex items-start justify-between gap-4 pt-6">
        <div className="flex items-start gap-3">
          <Button variant="outline" size="icon" onClick={onBack}>
            <ArrowLeft />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">{environment.databaseName ?? "app"}</h1>
            <p className="text-sm text-muted-foreground">
              {siteNames.join(", ") || environment.name} · {environment.database}{" "}
              {environment.databaseVersion}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {services.includes("adminer") && (
            <AdminButton service="adminer" environment={environment} label="Adminer" />
          )}
          {services.includes("phpmyadmin") && (
            <AdminButton service="phpmyadmin" environment={environment} label="phpMyAdmin" />
          )}
        </div>
      </div>

      {message && (
        <Alert variant={messageOk ? "default" : "destructive"}>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{text.connectionSettings}</CardTitle>
          <CardDescription>{text.connectionSettingsDescription}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Credential label={text.host} value="database" />
          <Credential
            label={text.crossProjectHost}
            value={`database.${environment.name.replaceAll("_", "-").toLowerCase()}.localhost`}
          />
          <Credential label={text.databaseColumn} value={environment.databaseName ?? "app"} />
          <Credential label={text.user} value={environment.databaseUser ?? "app"} />
          <Credential
            label={text.password}
            value={environment.databasePassword ?? "localdev"}
            secret
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{text.databaseActions}</CardTitle>
          <CardDescription>{text.databaseActionsDescription}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void importSql()}>
            <Upload /> {text.importSql}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void exportSql()}>
            <Download /> {text.exportSql}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void action("create_database_backup", {}, text.databaseBackupCreated).catch(
                () => undefined,
              )
            }
          >
            <Save /> {text.quickBackup}
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => setClearOpen(true)}>
            <Eraser /> {text.clearDatabase}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{text.serverDatabases}</CardTitle>
          <CardDescription>{text.serverDatabasesDescription}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex gap-2">
            <Input
              value={name}
              placeholder="new_database"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void create()}
            />
            <Button disabled={busy || !name.trim()} onClick={() => void create()}>
              <Plus /> {text.create}
            </Button>
            <Button variant="outline" size="icon" disabled={busy} onClick={() => void load()}>
              <RefreshCw className={busy ? "animate-spin" : ""} />
            </Button>
          </div>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{text.nameColumn}</TableHead>
                  <TableHead>{text.sizeColumn}</TableHead>
                  <TableHead>{text.connectionsColumn}</TableHead>
                  <TableHead>{text.typeColumn}</TableHead>
                  <TableHead className="text-right">{text.actionsColumn}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {databases.map((database) => (
                  <TableRow key={database.name}>
                    <TableCell className="font-mono text-xs">{database.name}</TableCell>
                    <TableCell>{database.size}</TableCell>
                    <TableCell>{database.connections}</TableCell>
                    <TableCell>
                      {database.configured
                        ? text.project
                        : database.system
                          ? text.system
                          : text.additional}
                    </TableCell>
                    <TableCell className="text-right">
                      {!database.configured && !database.system && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={busy}
                          title={text.renameDatabase}
                          onClick={() => {
                            setRenameSource(database.name)
                            setRenameTarget(database.name)
                          }}
                        >
                          <Pencil />
                        </Button>
                      )}
                      {!database.system && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={busy}
                          title={text.cloneDatabase}
                          onClick={() => {
                            setCloneSource(database.name)
                            setCloneTarget(`${database.name}_copy`)
                          }}
                        >
                          <Copy />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={busy || database.configured || database.system}
                        onClick={() => setDeleteName(database.name)}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <DatabaseConsole environment={environment} />
      <DatabaseBackups environment={environment} uk={uk} />

      <Dialog
        open={Boolean(cloneSource)}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setCloneSource("")
            setCloneTarget("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{text.cloneDatabaseTitle(cloneSource)}</DialogTitle>
            <DialogDescription>{text.cloneDatabaseDescription}</DialogDescription>
          </DialogHeader>
          <Input
            value={cloneTarget}
            placeholder="database_copy"
            onChange={(event) => setCloneTarget(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void clone()}
          />
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setCloneSource("")}>
              {text.cancel}
            </Button>
            <Button disabled={busy || !cloneTarget.trim()} onClick={() => void clone()}>
              {busy ? text.cloning : text.cloneDatabase}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(renameSource)}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setRenameSource("")
            setRenameTarget("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{text.renameDatabaseTitle(renameSource)}</DialogTitle>
            <DialogDescription>{text.renameDatabaseDescription}</DialogDescription>
          </DialogHeader>
          <Input
            value={renameTarget}
            placeholder="new_database_name"
            onChange={(event) => setRenameTarget(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void rename()}
          />
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setRenameSource("")}>
              {text.cancel}
            </Button>
            <Button
              disabled={busy || !renameTarget.trim() || renameTarget.trim() === renameSource}
              onClick={() => void rename()}
            >
              {busy ? text.renaming : text.renameDatabase}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteName)} onOpenChange={(open) => !open && setDeleteName("")}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{text.deleteDatabaseTitle(deleteName)}</AlertDialogTitle>
            <AlertDialogDescription>{text.deleteDatabaseDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{text.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const target = deleteName
                setDeleteName("")
                void action("delete_database", { name: target }, text.databaseDeleted)
                  .then(load)
                  .catch(() => undefined)
              }}
            >
              {text.deleteDatabase}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearOpen} onOpenChange={(open) => !busy && setClearOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {text.clearDatabaseTitle(environment.databaseName ?? text.projectDatabaseFallback)}
            </AlertDialogTitle>
            <AlertDialogDescription>{text.clearDatabaseDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{text.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={() =>
                void action("clear_database", {}, text.databaseCleared)
                  .then(() => setClearOpen(false))
                  .then(load)
                  .catch(() => undefined)
              }
            >
              {text.backupAndClear}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function AdminButton({
  service,
  environment,
  label,
}: {
  service: string
  environment: Environment
  label: string
}) {
  return (
    <Button
      variant="outline"
      onClick={() =>
        void invoke("open_url", {
          url: `https://${serviceHostname(service, environment.name)}`,
        })
      }
    >
      {label} <ExternalLink />
    </Button>
  )
}
