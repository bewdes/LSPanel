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
import { Checkbox } from "@/components/ui/checkbox"
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
  language,
}: {
  environments: Environment[]
  sites: Site[]
  language: string
}) {
  const text = pickLanguage(language).database
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
        language={language}
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
      <div className="grid gap-3 px-4 lg:px-6">
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-11 px-4">{text.siteColumn}</TableHead>
                <TableHead className="h-11">{text.engineColumn}</TableHead>
                <TableHead className="h-11">{text.usageColumn}</TableHead>
                <TableHead className="h-11">{text.statusColumn}</TableHead>
                <TableHead className="h-11 px-4 text-right">{text.actionsColumn}</TableHead>
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
                  <TableRow
                    key={environment.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedId(environment.id)}
                  >
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted">
                          <Database className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {relatedSites.map((site) => site.name).join(", ") || environment.name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {relatedSites.map((site) => site.domain).join(", ") ||
                              text.noLinkedSite}
                          </p>
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            {environment.databaseName ?? "app"}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {environment.database} {environment.databaseVersion}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium tabular-nums">
                        {status?.size ?? text.checkingEllipsis}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {status ? text.connectionsCount(status.connections) : "—"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={status?.connected ? "default" : "secondary"}>
                        {status
                          ? status.connected
                            ? text.connected
                            : text.unavailable
                          : text.checking}
                      </Badge>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {admin ? admin : text.notEnabled}
                      </p>
                    </TableCell>
                    <TableCell className="px-4 text-right">
                      {admin && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title={admin}
                          onClick={(event) => {
                            event.stopPropagation()
                            void invoke("open_url", {
                              url: `https://${serviceHostname(admin.toLowerCase(), environment.name)}`,
                            })
                          }}
                        >
                          <ExternalLink />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={text.edit}
                        onClick={(event) => {
                          event.stopPropagation()
                          setSelectedId(environment.id)
                        }}
                      >
                        <Pencil />
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
        </Card>
      </div>
    </div>
  )
}

function DatabaseDetails({
  environment,
  siteNames,
  language,
  onBack,
}: {
  environment: Environment
  siteNames: string[]
  language: string
  onBack: () => void
}) {
  const text = pickLanguage(language).database
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
  const [tableExportOpen, setTableExportOpen] = React.useState(false)
  const [availableTables, setAvailableTables] = React.useState<string[]>([])
  const [selectedTables, setSelectedTables] = React.useState<Set<string>>(new Set())
  const [tablesLoading, setTablesLoading] = React.useState(false)
  const [tableExportError, setTableExportError] = React.useState("")
  const [tableImportOpen, setTableImportOpen] = React.useState(false)
  const [importPath, setImportPath] = React.useState("")
  const [importTables, setImportTables] = React.useState<string[]>([])
  const [selectedImportTables, setSelectedImportTables] = React.useState<Set<string>>(new Set())
  const [tableImportError, setTableImportError] = React.useState("")
  const [importTablesLoading, setImportTablesLoading] = React.useState(false)
  const [databaseReachable, setDatabaseReachable] = React.useState(true)
  const [backupsRefreshToken, setBackupsRefreshToken] = React.useState(0)

  const load = React.useCallback(async () => {
    setBusy(true)
    setMessage("")
    try {
      setDatabases(
        await invoke<DatabaseEntry[]>("list_databases", { environmentId: environment.id }),
      )
      setDatabaseReachable(true)
    } catch (value) {
      setMessage(errorMessage(value))
      setMessageOk(false)
      setDatabaseReachable(false)
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
    payload: Record<string, string | string[]> = {},
    success = text.operationCompleted,
  ) => {
    setBusy(true)
    setMessage("")
    try {
      await invoke(command, { environmentId: environment.id, ...payload })
      setMessage(success)
      setMessageOk(true)
      setBackupsRefreshToken((value) => value + 1)
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

  const openTableExport = async () => {
    setTableExportOpen(true)
    setTablesLoading(true)
    setSelectedTables(new Set())
    setTableExportError("")
    try {
      const tables = await invoke<string[]>("list_database_tables", {
        environmentId: environment.id,
      })
      setAvailableTables(tables)
    } catch (value) {
      setTableExportError(errorMessage(value))
    } finally {
      setTablesLoading(false)
    }
  }

  const toggleTable = (name: string) => {
    setSelectedTables((current) => {
      const next = new Set(current)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const exportSelectedTables = async () => {
    if (!selectedTables.size) return
    const path = await saveDialog({
      title: text.exportTablesTitle(environment.name),
      defaultPath: `${environment.databaseName ?? "database"}-tables.sql`,
      filters: [{ name: "SQL dump", extensions: ["sql"] }],
    })
    if (!path) return
    setTableExportError("")
    try {
      await action(
        "export_database_tables",
        { path, tables: Array.from(selectedTables) },
        text.databaseExported,
      )
      setTableExportOpen(false)
    } catch (value) {
      setTableExportError(errorMessage(value))
    }
  }

  const openTableImport = async () => {
    const path = await openDialog({
      title: text.importSqlInto(environment.name),
      multiple: false,
      directory: false,
      filters: [{ name: "SQL dump", extensions: ["sql"] }],
    })
    if (!path) return
    setImportPath(path)
    setTableImportOpen(true)
    setImportTablesLoading(true)
    setSelectedImportTables(new Set())
    setTableImportError("")
    try {
      const tables = await invoke<string[]>("list_dump_file_tables", { path })
      setImportTables(tables)
    } catch (value) {
      setTableImportError(errorMessage(value))
    } finally {
      setImportTablesLoading(false)
    }
  }

  const toggleImportTable = (name: string) => {
    setSelectedImportTables((current) => {
      const next = new Set(current)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const importSelectedTables = async () => {
    if (!selectedImportTables.size) return
    setTableImportError("")
    try {
      await action(
        "import_database_tables",
        { path: importPath, tables: Array.from(selectedImportTables) },
        text.databaseImported,
      )
      setTableImportOpen(false)
    } catch (value) {
      setTableImportError(errorMessage(value))
    }
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
          <Credential label={text.host} value="database" language={language} />
          <Credential
            label={text.crossProjectHost}
            value={`database.${environment.name.replaceAll("_", "-").toLowerCase()}.localhost`}
            language={language}
          />
          <Credential
            label={text.databaseColumn}
            value={environment.databaseName ?? "app"}
            language={language}
          />
          <Credential
            label={text.user}
            value={environment.databaseUser ?? "app"}
            language={language}
          />
          <Credential
            label={text.password}
            value={environment.databasePassword ?? "localdev"}
            secret
            language={language}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{text.databaseActions}</CardTitle>
          <CardDescription>{text.databaseActionsDescription}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy || !databaseReachable}
            onClick={() => void importSql()}
          >
            <Upload /> {text.importSql}
          </Button>
          <Button
            variant="outline"
            disabled={busy || !databaseReachable}
            onClick={() => void exportSql()}
          >
            <Download /> {text.exportSql}
          </Button>
          <Button
            variant="outline"
            disabled={busy || !databaseReachable}
            onClick={() => void openTableExport()}
          >
            <Download /> {text.exportTables}
          </Button>
          <Button
            variant="outline"
            disabled={busy || !databaseReachable}
            onClick={() => void openTableImport()}
          >
            <Upload /> {text.importTables}
          </Button>
          <Button
            variant="outline"
            disabled={busy || !databaseReachable}
            onClick={() =>
              void action("create_database_backup", {}, text.databaseBackupCreated).catch(
                () => undefined,
              )
            }
          >
            <Save /> {text.quickBackup}
          </Button>
          <Button
            variant="destructive"
            disabled={busy || !databaseReachable}
            onClick={() => setClearOpen(true)}
          >
            <Eraser /> {text.clearDatabase}
          </Button>
        </CardContent>
        {!databaseReachable && (
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">{text.startEnvironmentForActions}</p>
          </CardContent>
        )}
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
            <Button
              disabled={busy || !databaseReachable || !name.trim()}
              onClick={() => void create()}
            >
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
                          disabled={busy || !databaseReachable}
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
                          disabled={busy || !databaseReachable}
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
                        disabled={
                          busy || !databaseReachable || database.configured || database.system
                        }
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

      <DatabaseConsole environment={environment} language={language} />
      <DatabaseBackups
        environment={environment}
        language={language}
        refreshToken={backupsRefreshToken}
      />

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

      <Dialog
        open={tableExportOpen}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setTableExportOpen(false)
            setTableExportError("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{text.exportTablesTitle(environment.name)}</DialogTitle>
            <DialogDescription>{text.exportTablesDescription}</DialogDescription>
          </DialogHeader>
          {tableExportError && (
            <Alert variant="destructive">
              <AlertDescription>{tableExportError}</AlertDescription>
            </Alert>
          )}
          <div className="grid max-h-72 gap-1 overflow-y-auto">
            {tablesLoading && (
              <p className="text-sm text-muted-foreground">{text.checkingEllipsis}</p>
            )}
            {!tablesLoading && !tableExportError && !availableTables.length && (
              <p className="text-sm text-muted-foreground">{text.noTablesFound}</p>
            )}
            {availableTables.map((table) => (
              <label
                key={table}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
              >
                <Checkbox
                  checked={selectedTables.has(table)}
                  onCheckedChange={() => toggleTable(table)}
                />
                {table}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setTableExportOpen(false)
                setTableExportError("")
              }}
            >
              {text.cancel}
            </Button>
            <Button
              disabled={busy || !selectedTables.size}
              onClick={() => void exportSelectedTables()}
            >
              <Download /> {text.exportSelectedTables(selectedTables.size)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={tableImportOpen}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setTableImportOpen(false)
            setTableImportError("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{text.importTablesTitle(environment.name)}</DialogTitle>
            <DialogDescription>{text.importTablesDescription}</DialogDescription>
          </DialogHeader>
          {tableImportError && (
            <Alert variant="destructive">
              <AlertDescription>{tableImportError}</AlertDescription>
            </Alert>
          )}
          <div className="grid max-h-72 gap-1 overflow-y-auto">
            {importTablesLoading && (
              <p className="text-sm text-muted-foreground">{text.checkingEllipsis}</p>
            )}
            {!importTablesLoading && !tableImportError && !importTables.length && (
              <p className="text-sm text-muted-foreground">{text.noTablesFoundInFile}</p>
            )}
            {importTables.map((table) => (
              <label
                key={table}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
              >
                <Checkbox
                  checked={selectedImportTables.has(table)}
                  onCheckedChange={() => toggleImportTable(table)}
                />
                {table}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setTableImportOpen(false)
                setTableImportError("")
              }}
            >
              {text.cancel}
            </Button>
            <Button
              disabled={busy || !selectedImportTables.size}
              onClick={() => void importSelectedTables()}
            >
              <Upload /> {text.importSelectedTables(selectedImportTables.size)}
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
