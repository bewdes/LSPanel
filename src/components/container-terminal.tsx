import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { errorMessage } from "@/lib/errors"
import { listen } from "@tauri-apps/api/event"
import { Terminal as XTermTerminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { History, Plus, Save, Trash2, X } from "lucide-react"
import "@xterm/xterm/css/xterm.css"

import { pickLanguage } from "@/i18n"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Site = { id: string }
type Environment = {
  id: string
  webServer: string
  database: string
  extraServices?: string[]
  runtimeMode?: string
}
type TerminalEvent = { sessionId: string; data: string }
type SavedCommand = { id: number; siteId: string; label: string; command: string; service: string }
type CommandHistory = {
  id: number
  siteId: string
  command: string
  service: string
  executedAt: number
}

export function ContainerTerminal({
  site,
  environment,
  language,
}: {
  site: Site
  environment: Environment
  language: string
}) {
  const text = pickLanguage(language).containerTerminal
  const isNative = environment.runtimeMode === "native"
  const initialService = isNative ? "shell" : environment.webServer === "Nginx" ? "php" : "web"
  const [tabs, setTabs] = React.useState([{ id: 1, service: initialService }])
  const [activeId, setActiveId] = React.useState(1)
  const nextId = React.useRef(2)
  const [savedCommands, setSavedCommands] = React.useState<SavedCommand[]>([])
  const [history, setHistory] = React.useState<CommandHistory[]>([])
  const [commandLabel, setCommandLabel] = React.useState("")
  const [commandText, setCommandText] = React.useState("")
  const [commandError, setCommandError] = React.useState("")
  React.useEffect(() => {
    void Promise.all([
      invoke<SavedCommand[]>("list_saved_commands", { siteId: site.id }),
      invoke<CommandHistory[]>("list_command_history", { siteId: site.id }),
    ])
      .then(([commands, entries]) => {
        setSavedCommands(commands)
        setHistory(entries)
      })
      .catch((error) => setCommandError(errorMessage(error)))
  }, [site.id])
  const addTab = () => {
    if (tabs.length >= 6) return
    const id = nextId.current++
    setTabs((current) => [...current, { id, service: initialService }])
    setActiveId(id)
  }
  const closeTab = (id: number) => {
    setTabs((current) => {
      const remaining = current.filter((tab) => tab.id !== id)
      if (remaining.length) {
        if (activeId === id) setActiveId(remaining[remaining.length - 1].id)
        return remaining
      }
      const replacement = { id: nextId.current++, service: initialService }
      setActiveId(replacement.id)
      return [replacement]
    })
  }
  const saveCommand = async () => {
    const active = tabs.find((tab) => tab.id === activeId)
    if (!active) return
    setCommandError("")
    try {
      const saved = await invoke<SavedCommand>("save_quick_command", {
        siteId: site.id,
        label: commandLabel,
        command: commandText,
        service: active.service,
      })
      setSavedCommands((current) => [...current, saved])
      setCommandLabel("")
      setCommandText("")
    } catch (error) {
      setCommandError(errorMessage(error))
    }
  }
  const deleteCommand = async (id: number) => {
    try {
      await invoke("delete_quick_command", { siteId: site.id, id })
      setSavedCommands((current) => current.filter((command) => command.id !== id))
    } catch (error) {
      setCommandError(errorMessage(error))
    }
  }
  const clearHistory = async () => {
    try {
      await invoke("clear_command_history", { siteId: site.id })
      setHistory([])
    } catch (error) {
      setCommandError(errorMessage(error))
    }
  }
  const recordHistory = async (service: string, command: string) => {
    try {
      const entry = await invoke<CommandHistory | null>("record_command_history", {
        siteId: site.id,
        service,
        command,
      })
      if (entry) setHistory((current) => [entry, ...current].slice(0, 100))
    } catch {
      // History persistence must never prevent command execution.
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{isNative ? text.terminalTitle : text.containerTerminalTitle}</CardTitle>
        <CardDescription>
          {isNative ? text.nativeShellDescription : text.containerShellDescription}
        </CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" disabled={tabs.length >= 6} onClick={addTab}>
            <Plus /> {text.newTab}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex max-w-full gap-1 overflow-x-auto border-b pb-2">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`flex shrink-0 items-center rounded-md border ${
                activeId === tab.id ? "bg-muted" : "bg-background"
              }`}
            >
              <button
                type="button"
                className="px-3 py-1.5 text-sm"
                onClick={() => setActiveId(tab.id)}
              >
                {tab.service} · {tab.id}
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                title={text.closeTerminalTab}
                onClick={() => closeTab(tab.id)}
              >
                <X />
              </Button>
            </div>
          ))}
        </div>
        <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(120px,0.35fr)_minmax(220px,1fr)_auto]">
          <Input
            value={commandLabel}
            maxLength={80}
            placeholder={text.commandLabelPlaceholder}
            onChange={(event) => setCommandLabel(event.target.value)}
          />
          <Input
            value={commandText}
            maxLength={1000}
            placeholder="php artisan migrate"
            className="font-mono"
            onChange={(event) => setCommandText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && commandLabel.trim() && commandText.trim())
                void saveCommand()
            }}
          />
          <Button
            variant="outline"
            disabled={!commandLabel.trim() || !commandText.trim()}
            onClick={() => void saveCommand()}
          >
            <Save /> {text.saveCommand}
          </Button>
          {history.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => void clearHistory()}>
              <History /> {text.clearHistory}
            </Button>
          )}
          {commandError && <p className="text-xs text-destructive sm:col-span-3">{commandError}</p>}
        </div>
        {tabs.map((tab) => (
          <div key={tab.id} className={activeId === tab.id ? "block" : "hidden"}>
            <TerminalSession
              site={site}
              environment={environment}
              language={language}
              onServiceChange={(service) =>
                setTabs((current) =>
                  current.map((item) => (item.id === tab.id ? { ...item, service } : item)),
                )
              }
              savedCommands={savedCommands}
              onDeleteCommand={deleteCommand}
              history={history}
              onExecuted={recordHistory}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function TerminalSession({
  site,
  environment,
  language,
  onServiceChange,
  savedCommands,
  onDeleteCommand,
  history,
  onExecuted,
}: {
  site: Site
  environment: Environment
  language: string
  onServiceChange: (service: string) => void
  savedCommands: SavedCommand[]
  onDeleteCommand: (id: number) => Promise<void>
  history: CommandHistory[]
  onExecuted: (service: string, command: string) => Promise<void>
}) {
  const text = pickLanguage(language).containerTerminal
  const isNative = environment.runtimeMode === "native"
  const [service, setService] = React.useState(
    isNative ? "shell" : environment.webServer === "Nginx" ? "php" : "web",
  )
  const [error, setError] = React.useState("")
  const host = React.useRef<HTMLDivElement>(null)
  const sessionRef = React.useRef("")
  const services = [
    "web",
    ...(environment.webServer === "Nginx" ? ["php"] : []),
    "database",
    ...(environment.extraServices ?? []),
  ]

  React.useEffect(() => {
    const element = host.current
    if (!element) return
    let sessionId = ""
    let disposed = false
    let cleanup = () => {}
    const terminal = new XTermTerminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 13,
      theme: { background: "#09090b", foreground: "#e4e4e7", cursor: "#fafafa" },
      scrollback: 5000,
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(element)
    fit.fit()
    terminal.writeln(`\x1b[2m${text.connectingToContainer}\x1b[0m`)
    const start = async () => {
      const output = await listen<TerminalEvent>("terminal-output", (event) => {
        if (event.payload.sessionId === sessionId) terminal.write(event.payload.data)
      })
      const exited = await listen<TerminalEvent>("terminal-exited", (event) => {
        if (event.payload.sessionId === sessionId)
          terminal.writeln(`\r\n\x1b[2m${text.sessionEnded}\x1b[0m`)
      })
      try {
        sessionId = await invoke<string>("open_container_terminal", {
          siteId: site.id,
          service,
          cols: terminal.cols,
          rows: terminal.rows,
        })
        sessionRef.current = sessionId
        const input = terminal.onData((data) => {
          if (sessionId) void invoke("write_container_terminal", { sessionId, data })
        })
        const resize = terminal.onResize((size) => {
          if (sessionId)
            void invoke("resize_container_terminal", {
              sessionId,
              cols: size.cols,
              rows: size.rows,
            })
        })
        const observer = new ResizeObserver(() => fit.fit())
        observer.observe(element)
        cleanup = () => {
          observer.disconnect()
          input.dispose()
          resize.dispose()
          output()
          exited()
          sessionRef.current = ""
          if (sessionId) void invoke("close_container_terminal", { sessionId })
          terminal.dispose()
        }
      } catch (value) {
        setError(errorMessage(value))
        output()
        exited()
        terminal.writeln(`\r\n\x1b[31m${errorMessage(value)}\x1b[0m`)
        cleanup = () => terminal.dispose()
      }
      if (disposed) cleanup()
    }
    void start()
    return () => {
      disposed = true
      cleanup()
    }
  }, [site.id, service, text.connectingToContainer, text.sessionEnded])

  const commands = isNative
    ? []
    : service === "php" || service === "web"
      ? ["php -v", "composer install", "php artisan migrate", "php artisan cache:clear"]
      : service === "node"
        ? ["node --version", "npm install", "npm run dev", "npm run build"]
        : service === "database"
          ? [environment.database === "PostgreSQL" ? "psql --version" : "mariadb --version"]
          : []
  const run = (command: string) => {
    host.current?.querySelector("textarea")?.focus()
    if (sessionRef.current)
      void invoke("write_container_terminal", {
        sessionId: sessionRef.current,
        data: `${command}\r`,
      })
        .then(() => onExecuted(service, command))
        .catch((value) => setError(errorMessage(value)))
  }
  const changeService = (value: string | null) => {
    if (!value) return
    setService(value)
    onServiceChange(value)
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{text.interactiveShell}</p>
        {!isNative && (
          <Select value={service} onValueChange={changeService}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {services.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        {commands.map((command) => (
          <Button key={command} variant="outline" size="sm" onClick={() => run(command)}>
            {command}
          </Button>
        ))}
        {savedCommands
          .filter((command) => command.service === service)
          .map((command) => (
            <div key={command.id} className="flex items-center rounded-md border">
              <Button
                variant="ghost"
                size="sm"
                title={command.command}
                onClick={() => run(command.command)}
              >
                {command.label}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                title={text.deleteSavedCommand}
                onClick={() => void onDeleteCommand(command.id)}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
      </div>
      {history.some((entry) => entry.service === service) && (
        <div className="grid gap-2 rounded-lg border p-2">
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <History className="size-3" /> {text.recentCommands}
          </p>
          <div className="flex flex-wrap gap-1">
            {history
              .filter((entry) => entry.service === service)
              .slice(0, 10)
              .map((entry) => (
                <Button
                  key={entry.id}
                  variant="ghost"
                  size="sm"
                  className="max-w-72 font-mono"
                  title={entry.command}
                  onClick={() => run(entry.command)}
                >
                  <span className="truncate">{entry.command}</span>
                </Button>
              ))}
          </div>
        </div>
      )}
      <div ref={host} className="h-[430px] overflow-hidden rounded-lg border bg-zinc-950 p-2" />
    </div>
  )
}
