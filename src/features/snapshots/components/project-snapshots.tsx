import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { errorMessage } from "@/lib/errors"
import { open as openDialog } from "@tauri-apps/plugin-dialog"
import { Download, Eraser, GitCompare, RefreshCw, Save, Trash2, Upload } from "lucide-react"

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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { pickLanguage } from "@/i18n"
import { projectSnapshotsText } from "@/i18n/project-snapshots"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { formatMetricBytes } from "@/lib/format"
import type { Site } from "@/types"
import type { ProjectSnapshot, SnapshotComparison } from "@/features/snapshots/types"

export function ProjectSnapshots({
  site,
  uk,
  onChanged,
}: {
  site: Site
  uk: boolean
  onChanged?: () => void
}) {
  const text = pickLanguage(projectSnapshotsText, uk)
  const [items, setItems] = React.useState<ProjectSnapshot[]>([])
  const [name, setName] = React.useState("")
  const [keep, setKeep] = React.useState(10)
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState("")
  const [messageOk, setMessageOk] = React.useState(false)
  const [comparison, setComparison] = React.useState<{
    snapshot: ProjectSnapshot
    result: SnapshotComparison
  } | null>(null)
  const [confirm, setConfirm] = React.useState<{
    item: ProjectSnapshot
    action: "restore" | "delete"
  } | null>(null)
  const refresh = React.useCallback(
    () =>
      invoke<ProjectSnapshot[]>("list_project_snapshots", { siteId: site.id })
        .then(setItems)
        .catch((error) => {
          setMessage(errorMessage(error))
          setMessageOk(false)
        }),
    [site.id],
  )
  React.useEffect(() => {
    void refresh()
  }, [refresh])
  async function create() {
    setBusy(true)
    setMessage("")
    try {
      await invoke("create_project_snapshot", { siteId: site.id, name: name || "Manual snapshot" })
      setName("")
      setMessage(text.projectSnapshotCreated)
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
  async function execute() {
    if (!confirm) return
    setBusy(true)
    setMessage("")
    try {
      await invoke(
        confirm.action === "restore" ? "restore_project_snapshot" : "delete_project_snapshot",
        { siteId: site.id, snapshotId: confirm.item.id },
      )
      setMessage(confirm.action === "restore" ? text.projectSnapshotRestored : text.snapshotDeleted)
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
  async function exportSnapshot(item: ProjectSnapshot) {
    const destination = await openDialog({
      directory: true,
      multiple: false,
      title: text.exportSnapshotDialogTitle,
    })
    if (!destination) return
    setBusy(true)
    setMessage("")
    try {
      const path = await invoke<string>("export_project_snapshot", {
        siteId: site.id,
        snapshotId: item.id,
        destination,
      })
      setMessage(text.snapshotExportedTo(path))
      setMessageOk(true)
    } catch (error) {
      setMessage(errorMessage(error))
      setMessageOk(false)
    } finally {
      setBusy(false)
    }
  }
  async function importSnapshot() {
    const source = await openDialog({
      directory: true,
      multiple: false,
      title: text.selectSnapshotDirTitle,
    })
    if (!source) return
    setBusy(true)
    setMessage("")
    try {
      await invoke("import_project_snapshot", { siteId: site.id, source })
      setMessage(text.projectSnapshotImported)
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
  async function compareSnapshot(snapshot: ProjectSnapshot) {
    setBusy(true)
    setMessage("")
    try {
      const result = await invoke<SnapshotComparison>("compare_project_snapshot", {
        siteId: site.id,
        snapshotId: snapshot.id,
      })
      setComparison({ snapshot, result })
    } catch (error) {
      setMessage(errorMessage(error))
      setMessageOk(false)
    } finally {
      setBusy(false)
    }
  }
  async function pruneSnapshots() {
    const removeCount = Math.max(0, items.length - keep)
    if (!removeCount) {
      setMessage(text.nothingToClean(items.length))
      setMessageOk(true)
      return
    }
    if (!window.confirm(text.confirmPrune(removeCount, keep))) return
    setBusy(true)
    setMessage("")
    try {
      const removed = await invoke<number>("prune_project_snapshots", {
        siteId: site.id,
        keep,
      })
      setMessage(text.oldSnapshotsDeleted(removed))
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.projectSnapshots}</CardTitle>
        <CardDescription>{text.projectSnapshotsDescription}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {message && (
          <Alert variant={messageOk ? "default" : "destructive"}>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <Input
            className="min-w-60 flex-1"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder="Before dependency upgrade"
          />
          <Button disabled={busy} onClick={() => void create()}>
            <Save />
            {busy ? text.working : text.createSnapshot}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void importSnapshot()}>
            <Upload />
            {text.import}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{text.snapshotRetention}</p>
            <p className="text-xs text-muted-foreground">{text.snapshotRetentionHint}</p>
          </div>
          <Input
            type="number"
            min={1}
            max={100}
            className="w-20"
            aria-label={text.snapshotsToKeepLabel}
            value={keep}
            onChange={(event) =>
              setKeep(Math.min(100, Math.max(1, Number(event.target.value) || 1)))
            }
          />
          <Button variant="outline" disabled={busy} onClick={() => void pruneSnapshots()}>
            <Eraser />
            {text.cleanOld}
          </Button>
        </div>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{text.snapshotColumn}</TableHead>
                <TableHead>{text.databaseDumpColumn}</TableHead>
                <TableHead className="text-right">{text.actionsColumn}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <p className="font-medium">{item.name || text.snapshotFallback}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </TableCell>
                  <TableCell>
                    {item.hasDatabase ? formatMetricBytes(item.size) : text.configurationOnly}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => setConfirm({ item, action: "restore" })}
                    >
                      <RefreshCw />
                      {text.restore}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy}
                      title={text.compareWithCurrent}
                      onClick={() => void compareSnapshot(item)}
                    >
                      <GitCompare />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy}
                      title={text.exportSnapshot}
                      onClick={() => void exportSnapshot(item)}
                    >
                      <Download />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy}
                      onClick={() => setConfirm({ item, action: "delete" })}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!items.length && (
            <p className="py-10 text-center text-sm text-muted-foreground">{text.noSnapshotsYet}</p>
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
              {confirm?.action === "restore" ? text.restoreSnapshotTitle : text.deleteSnapshotTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === "restore"
                ? text.restoreSnapshotDescription
                : text.deleteSnapshotDescription}
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
                  ? text.restoreSnapshot
                  : text.deleteSnapshot}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={Boolean(comparison)} onOpenChange={(open) => !open && setComparison(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{text.snapshotComparison}</DialogTitle>
            <DialogDescription>
              {text.comparedWithCurrent(comparison?.snapshot.name || text.snapshotFallback)}
            </DialogDescription>
          </DialogHeader>
          {comparison && <ComparisonResult result={comparison.result} uk={uk} />}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function ComparisonResult({ result, uk }: { result: SnapshotComparison; uk: boolean }) {
  const text = pickLanguage(projectSnapshotsText, uk)
  const groups = [
    { title: text.configFieldsChanged, values: result.configurationChanges },
    { title: text.envKeysAdded, values: result.envAdded },
    { title: text.envKeysRemoved, values: result.envRemoved },
    { title: text.envValuesChanged, values: result.envChanged },
  ]
  const changes = groups.reduce((total, group) => total + group.values.length, 0)
  return (
    <div className="grid max-h-[65vh] gap-3 overflow-auto">
      <Alert>
        <AlertDescription>
          {changes ? text.changesDetected(changes) : text.configMatchesCurrent}{" "}
          {text.snapshotDatabaseDumpLabel(formatMetricBytes(result.snapshotDatabaseSize))}
        </AlertDescription>
      </Alert>
      {groups.map((group) => (
        <div key={group.title} className="rounded-lg border p-3">
          <p className="text-sm font-medium">{group.title}</p>
          {group.values.length ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {group.values.map((value) => (
                <code key={value} className="rounded bg-muted px-2 py-1 text-xs">
                  {value}
                </code>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">{text.noChanges}</p>
          )}
        </div>
      ))}
    </div>
  )
}
