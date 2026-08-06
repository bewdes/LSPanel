import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  HardDrive,
  RefreshCw,
  Trash2,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { pickLanguage } from "@/i18n"
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

type HealthCheck = {
  code: string
  title: string
  status: "healthy" | "warning" | "error"
  summary: string
  impact: string
  suggestions: string[]
}
type HealthReport = {
  status: "healthy" | "warning" | "error"
  checkedAt: number
  checks: HealthCheck[]
}
type DiskUsageCategory = {
  label: string
  total: string
  active: string
  size: string
  reclaimable: string
}

export function SystemHealthPage({ language }: { language: string }) {
  const [report, setReport] = React.useState<HealthReport | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [diskUsage, setDiskUsage] = React.useState<DiskUsageCategory[] | null>(null)
  const [diskError, setDiskError] = React.useState("")
  const [pruneBusy, setPruneBusy] = React.useState(false)
  const [pruneResult, setPruneResult] = React.useState("")
  const [confirmPrune, setConfirmPrune] = React.useState<"buildCache" | "images" | null>(null)
  const text = pickLanguage(language).systemHealth
  const refresh = React.useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      setReport(await invoke<HealthReport>("system_health"))
    } catch (value) {
      setError(String(value))
    } finally {
      setLoading(false)
    }
  }, [])
  const refreshDiskUsage = React.useCallback(async () => {
    setDiskError("")
    try {
      setDiskUsage(await invoke<DiskUsageCategory[]>("disk_usage"))
    } catch (value) {
      setDiskError(String(value))
    }
  }, [])
  React.useEffect(() => {
    void refresh()
    void refreshDiskUsage()
  }, [refresh, refreshDiskUsage])
  const runPrune = async () => {
    if (!confirmPrune) return
    setPruneBusy(true)
    setPruneResult("")
    try {
      const summary = await invoke<string>(
        confirmPrune === "buildCache" ? "prune_build_cache" : "prune_dangling_images",
      )
      setPruneResult(summary)
      setConfirmPrune(null)
      await refreshDiskUsage()
    } catch (value) {
      setPruneResult(String(value))
    } finally {
      setPruneBusy(false)
    }
  }
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-6 lg:px-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{text.systemHealth}</h2>
          <p className="text-sm text-muted-foreground">{text.systemHealthDescription}</p>
        </div>
        <Button variant="outline" disabled={loading} onClick={refresh}>
          <RefreshCw className={loading ? "animate-spin" : ""} />
          {text.runChecks}
        </Button>
      </div>
      {error && (
        <Alert variant="destructive" className="mx-4 lg:mx-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 px-4 pb-6 sm:grid-cols-2 xl:grid-cols-4 lg:px-6">
        {report?.checks.map((item) => (
          <Card key={item.code}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {item.status === "healthy" ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                ) : item.status === "error" ? (
                  <CircleAlert className="size-4 shrink-0 text-destructive" />
                ) : (
                  <AlertTriangle className="size-4 shrink-0 text-amber-500" />
                )}
                {item.title}
              </CardTitle>
              <CardAction>
                <Badge
                  variant={
                    item.status === "healthy"
                      ? "default"
                      : item.status === "error"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {item.status}
                </Badge>
              </CardAction>
            </CardHeader>
          </Card>
        ))}
        {loading &&
          !report &&
          Array.from({ length: 4 }, (_, index) => (
            <Card key={index} className="h-20 animate-pulse bg-muted/30" />
          ))}
      </div>
      {report && report.checks.some((item) => item.status !== "healthy") && (
        <div className="grid gap-3 px-4 pb-6 lg:px-6">
          {report.checks
            .filter((item) => item.status !== "healthy")
            .map((item) => (
              <Alert key={item.code} variant={item.status === "error" ? "destructive" : "default"}>
                {item.status === "error" ? (
                  <CircleAlert />
                ) : (
                  <AlertTriangle className="text-amber-500" />
                )}
                <AlertTitle>{item.title}</AlertTitle>
                <AlertDescription className="grid gap-2">
                  <p>{item.impact}</p>
                  {item.suggestions.length > 0 && (
                    <div>
                      <p className="mb-1 font-medium text-foreground">{text.howToFix}</p>
                      <ul className="list-disc space-y-1 pl-4">
                        {item.suggestions.map((suggestion) => (
                          <li key={suggestion}>{suggestion}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            ))}
        </div>
      )}
      <div className="px-4 pb-6 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="size-4" />
              {text.diskUsage}
            </CardTitle>
            <CardDescription>{text.diskUsageDescription}</CardDescription>
            <CardAction className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pruneBusy}
                onClick={() => setConfirmPrune("buildCache")}
              >
                <Trash2 />
                Build cache
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pruneBusy}
                onClick={() => setConfirmPrune("images")}
              >
                <Trash2 />
                {text.danglingImages}
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-3">
            {diskError && (
              <Alert variant="destructive">
                <AlertDescription>{diskError}</AlertDescription>
              </Alert>
            )}
            {pruneResult && (
              <Alert>
                <AlertDescription>{pruneResult}</AlertDescription>
              </Alert>
            )}
            {diskUsage && diskUsage.length > 0 ? (
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{text.category}</TableHead>
                      <TableHead>{text.total}</TableHead>
                      <TableHead>{text.active}</TableHead>
                      <TableHead>{text.size}</TableHead>
                      <TableHead>{text.reclaimable}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {diskUsage.map((category) => (
                      <TableRow key={category.label}>
                        <TableCell className="font-medium">{category.label}</TableCell>
                        <TableCell>{category.total || "—"}</TableCell>
                        <TableCell>{category.active || "—"}</TableCell>
                        <TableCell>{category.size || "—"}</TableCell>
                        <TableCell>{category.reclaimable || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              !diskError && <p className="text-sm text-muted-foreground">{text.loading}</p>
            )}
          </CardContent>
        </Card>
      </div>
      <AlertDialog
        open={Boolean(confirmPrune)}
        onOpenChange={(open) => {
          if (!open && !pruneBusy) setConfirmPrune(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmPrune === "buildCache"
                ? text.cleanBuildCacheTitle
                : text.removeDanglingImagesTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmPrune === "buildCache"
                ? text.cleanBuildCacheDescription
                : text.removeDanglingImagesDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pruneBusy}>{text.cancel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={pruneBusy}
              onClick={(event) => {
                event.preventDefault()
                void runPrune()
              }}
            >
              {pruneBusy ? text.cleaning : text.clean}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
