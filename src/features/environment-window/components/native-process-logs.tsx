import * as React from "react"
import { listen } from "@tauri-apps/api/event"
import { invoke } from "@tauri-apps/api/core"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { pickLanguage } from "@/i18n"

export function NativeProcessLogs({
  environmentId,
  language,
}: {
  environmentId: string
  language: string
}) {
  const text = pickLanguage(language).environmentWindow
  const [lines, setLines] = React.useState<string[]>([])
  const [paused, setPaused] = React.useState(false)
  const pausedRef = React.useRef(false)
  const viewport = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    pausedRef.current = paused
  }, [paused])
  React.useEffect(() => {
    let streamId = ""
    let disposed = false
    let cleanup = () => {}
    const start = async () => {
      setLines([])
      const unlisten = await listen<{
        streamId: string
        environmentId: string
        source: string
        line: string
      }>("environment-log-line", (event) => {
        if (
          event.payload.environmentId !== environmentId ||
          event.payload.streamId !== streamId ||
          pausedRef.current
        )
          return
        setLines((current) => [...current.slice(-1999), event.payload.line])
      })
      try {
        streamId = await invoke<string>("start_environment_log_stream", {
          environmentId,
          service: null,
        })
      } catch {
        unlisten()
        return
      }
      if (disposed) {
        unlisten()
        return
      }
      cleanup = () => unlisten()
    }
    void start()
    return () => {
      disposed = true
      cleanup()
    }
  }, [environmentId])
  React.useEffect(() => {
    if (viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight
  }, [lines])
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label>{text.recentLogsLabel}</Label>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPaused((current) => !current)}>
            {paused ? text.resume : text.pause}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setLines([])}>
            {text.clearView}
          </Button>
        </div>
      </div>
      <div
        ref={viewport}
        className="h-96 overflow-auto rounded-lg border bg-zinc-950 p-3 font-mono text-xs leading-5 text-zinc-200"
      >
        <pre className="whitespace-pre-wrap break-all">
          {lines.length ? lines.join("\n") : text.waitingForOutput}
        </pre>
      </div>
    </div>
  )
}
