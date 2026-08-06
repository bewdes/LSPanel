import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { save as saveDialog } from "@tauri-apps/plugin-dialog"
import { Copy, Download, Pause, Play, RotateCcw, Trash2 } from "lucide-react"

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
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { pickLanguage } from "@/i18n"
import type { Environment } from "@/types"
import type { LogLine } from "@/features/logs/types"

export function LiveLogs({
  environment,
  initialService = "all",
  language,
}: {
  environment: Environment
  initialService?: string
  language: string
}) {
  const text = pickLanguage(language).liveLogs
  const [service, setService] = React.useState(initialService)
  const [lines, setLines] = React.useState<LogEntry[]>([])
  const [search, setSearch] = React.useState("")
  const [level, setLevel] = React.useState<LogLevel | "all">("all")
  const [paused, setPaused] = React.useState(false)
  const [autoScroll, setAutoScroll] = React.useState(true)
  const [showContext, setShowContext] = React.useState(true)
  const [error, setError] = React.useState("")
  const [message, setMessage] = React.useState("")
  const [resetOpen, setResetOpen] = React.useState(false)
  const [resetting, setResetting] = React.useState(false)
  const [streamVersion, setStreamVersion] = React.useState(0)
  const pausedRef = React.useRef(false)
  const viewport = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    pausedRef.current = paused
  }, [paused])
  React.useEffect(() => {
    let streamId = ""
    let disposed = false
    const start = async () => {
      setError("")
      setLines([])
      const unlisten = await listen<LogLine>("environment-log-line", (event) => {
        if (
          event.payload.environmentId !== environment.id ||
          event.payload.streamId !== streamId ||
          pausedRef.current
        )
          return
        setLines((current) => [
          ...current.slice(-1999),
          {
            line: event.payload.line,
            source: event.payload.source,
            level: classifyLevel(event.payload.line),
            stack: isStackLine(event.payload.line),
          },
        ])
      })
      try {
        streamId = await invoke<string>("start_environment_log_stream", {
          environmentId: environment.id,
          service: service === "all" ? null : service,
        })
      } catch (value) {
        setError(String(value))
        unlisten()
      }
      if (disposed) {
        unlisten()
        if (streamId) void invoke("stop_environment_log_stream", { streamId })
      } else
        cleanup = () => {
          unlisten()
          if (streamId) void invoke("stop_environment_log_stream", { streamId })
        }
    }
    let cleanup = () => {}
    void start()
    return () => {
      disposed = true
      cleanup()
    }
  }, [environment.id, service, streamVersion])
  const visible = React.useMemo(() => {
    const query = search.toLowerCase()
    const leveled = level === "all" ? lines : lines.filter((line) => line.level === level)
    if (!query) return leveled
    if (!showContext) return leveled.filter((line) => line.line.toLowerCase().includes(query))
    const indexes = new Set<number>()
    leveled.forEach((line, index) => {
      if (line.line.toLowerCase().includes(query))
        for (
          let current = Math.max(0, index - 2);
          current <= Math.min(leveled.length - 1, index + 2);
          current++
        )
          indexes.add(current)
    })
    return [...indexes].sort((a, b) => a - b).map((index) => leveled[index])
  }, [level, lines, search, showContext])
  React.useEffect(() => {
    if (autoScroll && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight
  }, [visible, autoScroll])
  const services = [
    "web",
    ...(environment.webServer === "Nginx" ? ["php"] : []),
    "database",
    ...(environment.extraServices ?? []),
  ]
  const exportLogs = async () => {
    try {
      const path = await saveDialog({
        title: text.exportLogsDialogTitle,
        defaultPath: `${environment.name}-logs.txt`,
        filters: [{ name: "Text log", extensions: ["txt", "log"] }],
      })
      if (typeof path === "string")
        await invoke("export_environment_logs", {
          environmentId: environment.id,
          path,
          text: visible.map((entry) => entry.line).join("\n") + "\n",
        })
    } catch (value) {
      setError(String(value))
    }
  }
  const resetRuntimeLogs = async () => {
    if (service === "all") return
    setResetting(true)
    setError("")
    setMessage("")
    try {
      await invoke("clear_environment_service_logs", {
        id: environment.id,
        service,
      })
      setLines([])
      setResetOpen(false)
      setStreamVersion((value) => value + 1)
      setMessage(text.runtimeLogsCleared)
    } catch (value) {
      setError(String(value))
    } finally {
      setResetting(false)
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.liveLogs}</CardTitle>
        <CardDescription>{text.liveLogsDescription}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <Select value={service} onValueChange={(value) => value && setService(String(value))}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{text.allServices}</SelectItem>
              {services.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="min-w-44 flex-1"
            placeholder={text.searchLogsPlaceholder}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            value={level}
            onValueChange={(value) => value && setLevel(value as LogLevel | "all")}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{text.allLevels}</SelectItem>
              <SelectItem value="error">{text.errorLevel}</SelectItem>
              <SelectItem value="warning">{text.warningLevel}</SelectItem>
              <SelectItem value="info">{text.infoLevel}</SelectItem>
              <SelectItem value="debug">{text.debugLevel}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={paused ? "default" : "outline"}
            onClick={() => setPaused((value) => !value)}
          >
            {paused ? <Play /> : <Pause />}
            {paused ? text.resume : text.pause}
          </Button>
          <Button variant="outline" onClick={() => setLines([])}>
            <Trash2 />
            {text.clearView}
          </Button>
          {service !== "all" && (
            <Button variant="outline" disabled={resetting} onClick={() => setResetOpen(true)}>
              <RotateCcw />
              {text.resetRuntimeLogs}
            </Button>
          )}
          <Button
            variant="outline"
            disabled={!visible.length}
            onClick={() =>
              void navigator.clipboard.writeText(visible.map((entry) => entry.line).join("\n"))
            }
          >
            <Copy />
            {text.copy}
          </Button>
          <Button variant="outline" disabled={!visible.length} onClick={() => void exportLogs()}>
            <Download />
            {text.export}
          </Button>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={autoScroll} onCheckedChange={setAutoScroll} />
          {text.autoScroll} <span className="ml-auto">{text.linesCount(visible.length)}</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={showContext} onCheckedChange={setShowContext} />
          {text.showContextLines}
        </label>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {message && (
          <Alert>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        <div
          ref={viewport}
          className="h-[420px] overflow-auto rounded-lg border bg-zinc-950 p-3 font-mono text-xs leading-5 text-zinc-200"
        >
          <pre className="whitespace-pre-wrap break-all">
            {visible.length
              ? visible.map((entry, index) => (
                  <span key={index} className={`block ${logLineClass(entry)}`}>
                    {entry.line || " "}
                  </span>
                ))
              : text.waitingForOutput}
          </pre>
        </div>
      </CardContent>
      <AlertDialog open={resetOpen} onOpenChange={(open) => !resetting && setResetOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{text.resetDialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>{text.resetDialogDescription(service)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>{text.cancel}</AlertDialogCancel>
            <AlertDialogAction disabled={resetting} onClick={() => void resetRuntimeLogs()}>
              {resetting ? text.recreating : text.recreateAndClearLogs}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

type LogLevel = "error" | "warning" | "info" | "debug"
type LogEntry = {
  line: string
  source: string
  level: LogLevel
  stack: boolean
}

function classifyLevel(line: string): LogLevel {
  const value = line.toLowerCase()
  if (/\b(error|fatal|panic|exception|critical|emergency|failed)\b/.test(value)) return "error"
  if (/\b(warn|warning|deprecated)\b/.test(value)) return "warning"
  if (/\b(debug|trace|verbose)\b/.test(value)) return "debug"
  return "info"
}

function isStackLine(line: string) {
  return /^\s+(at |#\d+|File ")|^\s*Caused by:|^\s*Traceback/.test(line)
}

function logLineClass(entry: LogEntry) {
  if (entry.stack) return "border-l-2 border-sky-500/50 pl-2 text-sky-200"
  if (entry.level === "error") return "bg-red-950/30 text-red-300"
  if (entry.level === "warning") return "text-amber-300"
  if (entry.level === "debug") return "text-zinc-500"
  return ""
}
