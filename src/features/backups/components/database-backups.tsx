import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { Eraser, RefreshCw, Save, Server, Trash2 } from "lucide-react"

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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { errorMessage } from "@/lib/errors"
import { pickLanguage } from "@/i18n"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Environment } from "@/types"
import type { DatabaseBackup } from "@/features/backups/types"

export function DatabaseBackups({
  environment,
  language,
  onChanged,
}: {
  environment: Environment
  language: string
  onChanged?: () => void
}) {
  const text = pickLanguage(language).databaseBackups
  const [items, setItems] = React.useState<DatabaseBackup[]>([])
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState("")
  const [messageOk, setMessageOk] = React.useState(false)
  const [keep, setKeep] = React.useState(10)
  const [maxTotalMb, setMaxTotalMb] = React.useState("")
  const [databaseReachable, setDatabaseReachable] = React.useState(false)
  const [confirm, setConfirm] = React.useState<{
    backup: DatabaseBackup
    action: "restore" | "delete"
  } | null>(null)
  const refresh = React.useCallback(
    () =>
      invoke<DatabaseBackup[]>("list_database_backups", { environmentId: environment.id })
        .then(setItems)
        .catch((error) => {
          setMessage(errorMessage(error))
          setMessageOk(false)
        }),
    [environment.id],
  )
  React.useEffect(() => {
    void refresh()
  }, [refresh])
  React.useEffect(() => {
    let disposed = false
    invoke("database_info", { environmentId: environment.id })
      .then(() => !disposed && setDatabaseReachable(true))
      .catch(() => !disposed && setDatabaseReachable(false))
    return () => {
      disposed = true
    }
  }, [environment.id])
  const create = async () => {
    setBusy(true)
    setMessage("")
    try {
      await invoke("create_database_backup", { environmentId: environment.id })
      setMessage(text.databaseBackupCreated)
      setMessageOk(true)
      await refresh()
      onChanged?.()
    } catch (error) {
      setMessage(errorMessage(error))
      setMessageOk(false)
    } finally {
      setBusy(false)
    }
  }
  const pruneBackups = async () => {
    if (!window.confirm(text.confirmPruneGeneric)) return
    setBusy(true)
    setMessage("")
    try {
      const removed = await invoke<number>("prune_database_backups", {
        environmentId: environment.id,
        keep,
        maxTotalMb: maxTotalMb.trim() ? Number(maxTotalMb) : undefined,
      })
      setMessage(removed ? text.oldBackupsDeleted(removed) : text.nothingToClean(items.length))
      setMessageOk(true)
      await refresh()
      onChanged?.()
    } catch (error) {
      setMessage(errorMessage(error))
      setMessageOk(false)
    } finally {
      setBusy(false)
    }
  }
  const execute = async () => {
    if (!confirm) return
    setBusy(true)
    setMessage("")
    try {
      await invoke(
        confirm.action === "restore" ? "restore_database_backup" : "delete_database_backup",
        { environmentId: environment.id, backupId: confirm.backup.id },
      )
      setMessage(
        confirm.action === "restore" ? text.databaseRestoredSuccessfully : text.backupDeleted,
      )
      setMessageOk(true)
      setConfirm(null)
      await refresh()
      onChanged?.()
    } catch (error) {
      setMessage(errorMessage(error))
      setMessageOk(false)
    } finally {
      setBusy(false)
    }
  }
  const size = (bytes: number) =>
    bytes < 1024
      ? `${bytes} B`
      : bytes < 1024 * 1024
        ? `${(bytes / 1024).toFixed(1)} KiB`
        : `${(bytes / 1024 / 1024).toFixed(1)} MiB`
  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.databaseBackups}</CardTitle>
        <CardDescription>{text.databaseBackupsDescription}</CardDescription>
        <CardAction>
          <Button disabled={busy || !databaseReachable} onClick={() => void create()}>
            <Save />
            {busy ? text.working : text.createBackup}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        {message && (
          <Alert variant={messageOk ? "default" : "destructive"}>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        {!databaseReachable && (
          <p className="text-sm text-muted-foreground">{text.startEnvironmentForBackupRestore}</p>
        )}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{text.backupRetention}</p>
            <p className="text-xs text-muted-foreground">{text.backupRetentionHint}</p>
          </div>
          <Input
            type="number"
            min={1}
            max={100}
            className="w-20"
            aria-label={text.backupsToKeepLabel}
            value={keep}
            onChange={(event) =>
              setKeep(Math.min(100, Math.max(1, Number(event.target.value) || 1)))
            }
          />
          <Input
            type="number"
            min={0}
            className="w-28"
            placeholder={text.noSizeLimit}
            aria-label={text.maxTotalSizeLabel}
            value={maxTotalMb}
            onChange={(event) => setMaxTotalMb(event.target.value.replace(/[^0-9]/g, ""))}
          />
          <Button variant="outline" disabled={busy} onClick={() => void pruneBackups()}>
            <Eraser />
            {text.cleanOld}
          </Button>
        </div>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{text.createdColumn}</TableHead>
                <TableHead>{text.engineColumn}</TableHead>
                <TableHead>{text.sizeColumn}</TableHead>
                <TableHead className="text-right">{text.actionsColumn}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((backup) => (
                <TableRow key={backup.id}>
                  <TableCell>
                    <p className="font-medium">{new Date(backup.createdAt).toLocaleString()}</p>
                    <p className="max-w-56 truncate text-xs text-muted-foreground">{backup.id}</p>
                  </TableCell>
                  <TableCell>{backup.database}</TableCell>
                  <TableCell>{size(backup.size)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || !databaseReachable}
                      onClick={() => setConfirm({ backup, action: "restore" })}
                    >
                      <RefreshCw />
                      {text.restore}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy}
                      onClick={() => setConfirm({ backup, action: "delete" })}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!items.length && (
            <div className="grid place-items-center gap-2 py-16 text-muted-foreground">
              <Server className="size-7" />
              <p className="text-sm">{text.noBackupsYet}</p>
            </div>
          )}
        </div>
      </CardContent>
      <AlertDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirm(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === "restore" ? text.restoreBackupTitle : text.deleteBackupTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === "restore"
                ? text.restoreBackupDescription
                : text.deleteBackupDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{text.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm?.action === "delete" ? "destructive" : "default"}
              disabled={busy}
              onClick={(event) => {
                event.preventDefault()
                void execute()
              }}
            >
              {busy
                ? text.working
                : confirm?.action === "restore"
                  ? text.restoreDatabase
                  : text.deleteBackup}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
