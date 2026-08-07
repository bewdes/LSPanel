import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { Activity, CheckCircle2, CircleAlert, LoaderCircle, Search, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { pickLanguage } from "@/i18n"

type Operation = {
  id: string
  environmentId?: string
  kind: string
  status: "running" | "completed" | "failed" | "interrupted"
  progress: number
  stage: string
  error?: string
  startedAt: number
  finishedAt?: number
}

const operationEvents = [
  "operation-started",
  "operation-progress",
  "operation-completed",
  "operation-failed",
] as const

export function OperationCenter({ language }: { language: string }) {
  const text = pickLanguage(language).operationCenter
  const [operations, setOperations] = React.useState<Operation[]>([])
  const [query, setQuery] = React.useState("")
  const refresh = React.useCallback(
    () =>
      invoke<Operation[]>("list_operations")
        .then(setOperations)
        .catch(() => undefined),
    [],
  )

  React.useEffect(() => {
    void refresh()
    const listeners = operationEvents.map((event) =>
      listen<Operation>(event, ({ payload }) => {
        setOperations((current) =>
          [payload, ...current.filter((item) => item.id !== payload.id)]
            .sort((a, b) => b.startedAt - a.startedAt)
            .slice(0, 100),
        )
      }),
    )
    return () => {
      for (const listener of listeners) void listener.then((dispose) => dispose())
    }
  }, [refresh])

  const active = operations.filter((operation) => operation.status === "running")
  const failures = operations.filter(
    (operation) => operation.status === "failed" || operation.status === "interrupted",
  )
  const clearable = operations.some((operation) => operation.status !== "running")
  const normalizedQuery = query.trim().toLowerCase()
  const visible = normalizedQuery
    ? operations.filter((operation) =>
        `${operation.kind} ${operation.environmentId ?? ""}`
          .toLowerCase()
          .includes(normalizedQuery),
      )
    : operations

  const remove = (id: string) => {
    void invoke<Operation[]>("delete_operation", { id })
      .then(setOperations)
      .catch(() => undefined)
  }
  const clearAll = () => {
    void invoke<Operation[]>("clear_operations")
      .then(setOperations)
      .catch(() => undefined)
  }

  return (
    <SidebarMenuItem>
      <Sheet>
        <SheetTrigger render={<SidebarMenuButton tooltip={text.operations} />}>
          {active.length ? <LoaderCircle className="animate-spin" /> : <Activity />}
          <span>{text.operations}</span>
          {(active.length > 0 || failures.length > 0) && (
            <span className="ml-auto size-1.5 shrink-0 rounded-full bg-destructive" />
          )}
        </SheetTrigger>
        <SheetContent className="w-full min-w-0 overflow-x-hidden sm:max-w-md">
          <SheetHeader className="flex-row items-start gap-2">
            <div className="min-w-0 flex-1">
              <SheetTitle>{text.operations}</SheetTitle>
              <SheetDescription>{text.operationsDescription}</SheetDescription>
            </div>
          </SheetHeader>
          {operations.length > 0 && (
            <div className="relative px-4">
              <Search className="pointer-events-none absolute left-6.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={text.searchPlaceholder}
                className="pl-8"
              />
            </div>
          )}
          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-4">
            <div className="grid min-w-0 gap-3">
              {visible.map((operation) => (
                <OperationItem
                  key={operation.id}
                  operation={operation}
                  onRemove={remove}
                  removeLabel={text.remove}
                />
              ))}
              {!operations.length && (
                <div className="grid place-items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
                  <Activity className="size-7" />
                  <p className="text-sm">{text.noOperationsYet}</p>
                </div>
              )}
              {operations.length > 0 && !visible.length && (
                <div className="grid place-items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
                  <Search className="size-7" />
                  <p className="text-sm">{text.noMatches}</p>
                </div>
              )}
            </div>
          </div>
          <SheetFooter className="flex items-center gap-2 border-t px-4 py-3">
            <Button
              className="ml-auto"
              variant="destructive"
              size="sm"
              disabled={!clearable}
              onClick={clearAll}
            >
              <Trash2 />
              {text.clearAll}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </SidebarMenuItem>
  )
}

function OperationItem({
  operation,
  onRemove,
  removeLabel,
}: {
  operation: Operation
  onRemove: (id: string) => void
  removeLabel: string
}) {
  const running = operation.status === "running"
  const failed = operation.status === "failed" || operation.status === "interrupted"
  return (
    <div className="grid min-w-0 gap-3 rounded-lg border p-3">
      <div className="flex items-start gap-3">
        {running ? (
          <LoaderCircle className="mt-0.5 size-4 animate-spin" />
        ) : failed ? (
          <CircleAlert className="mt-0.5 size-4 text-destructive" />
        ) : (
          <CheckCircle2 className="mt-0.5 size-4" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium capitalize">{operation.kind}</span>
            <Badge variant={failed ? "destructive" : running ? "default" : "secondary"}>
              {operation.status}
            </Badge>
            <Button
              className="ml-auto"
              variant="ghost"
              size="icon-sm"
              disabled={running}
              title={removeLabel}
              onClick={() => onRemove(operation.id)}
            >
              <Trash2 />
            </Button>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {operation.environmentId ?? "LS Panel"} ·{" "}
            {new Date(operation.startedAt).toLocaleString()}
          </p>
        </div>
      </div>
      {running && (
        <div className="grid gap-1.5">
          <div className="flex justify-between gap-3 text-xs text-muted-foreground">
            <span className="truncate">{operation.stage}</span>
            <span className="tabular-nums">{operation.progress}%</span>
          </div>
          <Progress value={operation.progress} />
        </div>
      )}
      {failed && operation.error && (
        <p className="line-clamp-4 min-w-0 break-words whitespace-pre-wrap [overflow-wrap:anywhere] text-xs text-destructive">
          {operation.error}
        </p>
      )}
    </div>
  )
}
