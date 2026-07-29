import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { Play, RefreshCw } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { errorMessage } from "@/lib/errors"
import type { Environment } from "@/types"

export function DatabaseConsole({ environment }: { environment: Environment }) {
  const [sql, setSql] = React.useState("SELECT 1;")
  const [result, setResult] = React.useState("")
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>SQL console</CardTitle>
        <CardDescription>
          {info ? `${info.engine} ${info.version} · ${info.size}` : "Checking database connection…"}
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
          <Button disabled={busy || !sql.trim()} onClick={() => void execute()}>
            {busy ? <RefreshCw className="animate-spin" /> : <Play />}Run query
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
