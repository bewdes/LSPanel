import { Play, RefreshCw, RotateCw, Square } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { ButtonGroup } from "@/components/ui/button-group"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { pickLanguage } from "@/i18n"
import type { Environment } from "@/types"

import type { Inspection, OperationProgress, Runtime } from "../types"

export function EnvironmentStatusCard({
  id,
  draft,
  runtime,
  inspection,
  progress,
  busy,
  language,
  onOperate,
  onOperateService,
  onRefresh,
}: {
  id: string
  draft: Environment
  runtime: Runtime | null
  inspection: Inspection | null
  progress: OperationProgress | null
  busy: boolean
  language: string
  onOperate: (action: "start" | "stop" | "restart" | "rebuild") => void
  onOperateService: (service: string, action: "start" | "stop" | "restart") => void
  onRefresh: () => Promise<void>
}) {
  const text = pickLanguage(language).environmentWindow
  const isPartiallyRunning =
    inspection?.status === "running" && inspection.runningServices < inspection.services.length
  return (
    <>
      {(id || progress) && (
        <Card>
          <CardHeader className="flex-row items-center">
            <div>
              <CardTitle>{text.environmentStatus}</CardTitle>
              <CardDescription>
                {draft.runtimeMode === "native"
                  ? text.nativeRuntimeDescription
                  : (runtime?.message ?? text.checkingRuntime)}
              </CardDescription>
            </div>
            <Badge
              className="ml-auto"
              variant={
                inspection?.status === "running"
                  ? isPartiallyRunning
                    ? "destructive"
                    : "default"
                  : "secondary"
              }
            >
              {isPartiallyRunning
                ? text.partiallyRunning(inspection.runningServices, inspection.services.length)
                : (inspection?.status ?? text.checking)}
            </Badge>
          </CardHeader>
          <CardContent className="grid gap-4">
            {id && (
              <ButtonGroup>
                {inspection?.status === "running" ? (
                  <>
                    <Button variant="outline" disabled={busy} onClick={() => onOperate("stop")}>
                      <Square />
                      {text.stop}
                    </Button>
                    <Button variant="outline" disabled={busy} onClick={() => onOperate("restart")}>
                      <RotateCw />
                      {text.restart}
                    </Button>
                  </>
                ) : (
                  <Button
                    disabled={
                      busy ||
                      (draft.runtimeMode !== "native" &&
                        (!runtime?.running || !runtime?.composeAvailable))
                    }
                    onClick={() => onOperate("start")}
                  >
                    <Play />
                    {text.start}
                  </Button>
                )}
                <Button
                  variant="outline"
                  disabled={busy || (draft.runtimeMode !== "native" && !runtime?.composeAvailable)}
                  onClick={() => onOperate("rebuild")}
                >
                  <RefreshCw />
                  {text.rebuild}
                </Button>
                <Button variant="outline" disabled={busy} onClick={onRefresh}>
                  <RefreshCw />
                  {text.refreshStatus}
                </Button>
              </ButtonGroup>
            )}
            {progress && (
              <div className="grid gap-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{text.actionLabels[progress.stage] ?? progress.stage}</span>
                  <span>{progress.indeterminate ? text.working : `${progress.progress}%`}</span>
                </div>
                <Progress value={progress.progress} />
              </div>
            )}
            {inspection?.services?.length ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {inspection.services.map((service) => (
                  <div key={service.name} className="grid gap-3 rounded-lg border p-3 text-sm">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <span className="truncate font-medium">{service.name}</span>
                      <Badge
                        className="shrink-0"
                        variant={service.state === "running" ? "default" : "secondary"}
                      >
                        {(service.health || service.state).split(" · CPU ")[0]}
                      </Badge>
                    </div>
                    <ButtonGroup className="w-full">
                      {service.state === "running" ? (
                        <Button
                          className="flex-1"
                          variant="outline"
                          size="xs"
                          disabled={busy}
                          onClick={() => onOperateService(service.name, "stop")}
                        >
                          <Square />
                          {text.stop}
                        </Button>
                      ) : (
                        <Button
                          className="flex-1"
                          variant="outline"
                          size="xs"
                          disabled={busy}
                          onClick={() => onOperateService(service.name, "start")}
                        >
                          <Play />
                          {text.start}
                        </Button>
                      )}
                      <Button
                        className="flex-1"
                        variant="outline"
                        size="xs"
                        disabled={busy}
                        onClick={() => onOperateService(service.name, "restart")}
                      >
                        <RotateCw />
                        {text.restart}
                      </Button>
                    </ButtonGroup>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
      {inspection?.services?.some((service) => service.cpu || service.memory) && (
        <Card>
          <CardHeader>
            <CardTitle>{text.resourceUsage}</CardTitle>
            <CardDescription>{text.resourceUsageDescription}</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{text.serviceColumn}</TableHead>
                  <TableHead>{text.cpuColumn}</TableHead>
                  <TableHead>{text.memoryColumn}</TableHead>
                  <TableHead>{text.networkIoColumn}</TableHead>
                  <TableHead>{text.blockIoColumn}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inspection.services.map((service) => (
                  <TableRow key={service.name}>
                    <TableCell className="font-medium">{service.name}</TableCell>
                    <TableCell>{service.cpu || "—"}</TableCell>
                    <TableCell>{service.memory || "—"}</TableCell>
                    <TableCell>{service.networkIo || "—"}</TableCell>
                    <TableCell>{service.blockIo || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  )
}
