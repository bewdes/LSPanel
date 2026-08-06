import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { Play, RefreshCw } from "lucide-react"

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
import { Textarea } from "@/components/ui/textarea"
import { errorMessage } from "@/lib/errors"
import { pickLanguage } from "@/i18n"
import type { Environment } from "@/types"

// A client-side hint only, matching the same read-only keywords the backend
// checks before deciding whether to run an automatic safety backup - this
// just decides whether to show a confirmation, not a security boundary.
function isReadOnlyQuery(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return ["select", "show", "describe", "desc", "explain", "pragma"].some(
    (keyword) => normalized === keyword || normalized.startsWith(`${keyword} `),
  )
}

export function DatabaseConsole({
  environment,
  language,
}: {
  environment: Environment
  language: string
}) {
  const text = pickLanguage(language).database
  const [sql, setSql] = React.useState("SELECT 1;")
  const [result, setResult] = React.useState("")
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [confirmRun, setConfirmRun] = React.useState(false)
  const [info, setInfo] = React.useState<{
    connected: boolean
    size: string
    engine: string
    version: string
  } | null>(null)
  const refresh = React.useCallback(
    () =>
      invoke<{ connected: boolean; size: string; engine: string; version: string }>(
        "database_info",
        { environmentId: environment.id },
      )
        .then(setInfo)
        .catch((value) => setError(errorMessage(value))),
    [environment.id],
  )
  React.useEffect(() => {
    void refresh()
  }, [refresh])
  const execute = async () => {
    setBusy(true)
    setError("")
    try {
      setResult(await invoke<string>("database_query", { environmentId: environment.id, sql }))
      await refresh()
    } catch (value) {
      setError(errorMessage(value))
    } finally {
      setBusy(false)
    }
  }
  const run = () => {
    if (isReadOnlyQuery(sql)) {
      void execute()
    } else {
      setConfirmRun(true)
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.sqlConsole}</CardTitle>
        <CardDescription>
          {info ? `${info.engine} ${info.version} · ${info.size}` : text.checkingDatabaseConnection}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Textarea
          className="min-h-32 font-mono text-xs"
          value={sql}
          onChange={(event) => setSql(event.target.value)}
          placeholder="SELECT 1;"
        />
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {result && <Textarea readOnly className="min-h-32 font-mono text-xs" value={result} />}
        <div className="flex justify-end">
          <Button disabled={busy || !sql.trim()} onClick={run}>
            {busy ? <RefreshCw className="animate-spin" /> : <Play />}
            {text.runQuery}
          </Button>
        </div>
      </CardContent>
      <AlertDialog
        open={confirmRun}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmRun(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{text.destructiveQueryTitle}</AlertDialogTitle>
            <AlertDialogDescription>{text.destructiveQueryDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{text.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(event) => {
                event.preventDefault()
                setConfirmRun(false)
                void execute()
              }}
            >
              {text.runQuery}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
