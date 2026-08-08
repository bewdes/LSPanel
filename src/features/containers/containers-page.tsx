import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { errorMessage } from "@/lib/errors"
import {
  CircleAlert,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Server,
  Settings2,
  Square,
} from "lucide-react"

import { PageHeading } from "@/components/page-heading"
import { pickLanguage } from "@/i18n"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Environment } from "@/types"
import type { Diagnosis } from "@/features/containers/types"

export function ContainersPage({
  language,
  environments,
  states,
  onOperate,
  onRefresh,
  onEdit,
  onCreate,
}: {
  language: string
  environments: Environment[]
  states: Record<string, string>
  onOperate: (
    id: string,
    action:
      "start" | "stop" | "restart" | "pause" | "unpause" | "kill" | "rebuild" | "rebuild-no-cache",
  ) => void
  onRefresh: () => void
  onEdit: (environment: Environment) => void
  onCreate: () => void
}) {
  const createEnvironment = onCreate
  const text = pickLanguage(language).containers
  const [diagnosis, setDiagnosis] = React.useState<{
    environment: Environment
    result?: Diagnosis
    error?: string
  } | null>(null)
  const diagnose = async (environment: Environment) => {
    setDiagnosis({ environment })
    try {
      const result = await invoke<Diagnosis>("diagnose_environment", { id: environment.id })
      setDiagnosis({ environment, result })
    } catch (error) {
      setDiagnosis({ environment, error: errorMessage(error) })
    }
  }
  return (
    <div>
      <PageHeading
        title={text.containers}
        description={text.containersDescription}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={onRefresh}>
              <RefreshCw />
              {text.refresh}
            </Button>
            <Button onClick={createEnvironment}>
              <Plus />
              {text.newEnvironment}
            </Button>
          </div>
        }
      />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4 px-4 lg:px-6">
        {environments.map((environment) => {
          const active = states[environment.id] === "running"
          const isNative = environment.runtimeMode === "native"
          return (
            <Card className="h-full" key={environment.id}>
              <CardHeader>
                <CardTitle>{environment.name}</CardTitle>
                <CardAction className="flex items-center gap-1.5">
                  {isNative && <Badge variant="outline">{text.nativeBadge}</Badge>}
                  <Badge variant={active ? "default" : "secondary"}>
                    {states[environment.id] ?? text.stoppedFallback}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-48" align="end">
                      <DropdownMenuItem onClick={() => void diagnose(environment)}>
                        <CircleAlert />
                        {text.explainError}
                      </DropdownMenuItem>
                      {!isNative && (
                        <>
                          <DropdownMenuItem
                            disabled={!active}
                            onClick={() => onOperate(environment.id, "pause")}
                          >
                            <Pause />
                            {text.pause}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={active}
                            onClick={() => onOperate(environment.id, "unpause")}
                          >
                            <Play />
                            {text.resume}
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuItem
                        disabled={!active}
                        onClick={() => onOperate(environment.id, "restart")}
                      >
                        <RefreshCw />
                        {text.restart}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onOperate(environment.id, "rebuild")}>
                        <RefreshCw />
                        {text.rebuild}
                      </DropdownMenuItem>
                      {!isNative && (
                        <DropdownMenuItem
                          onClick={() => onOperate(environment.id, "rebuild-no-cache")}
                        >
                          <RefreshCw />
                          {text.rebuildWithoutCache}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={!active}
                        onClick={() => onOperate(environment.id, "kill")}
                      >
                        <Square />
                        {text.forceStop}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardAction>
              </CardHeader>
              <CardContent className="grid flex-1 content-start divide-y text-sm">
                {isNative ? (
                  <>
                    <div className="flex items-center justify-between py-1.5 first:pt-0 last:pb-0">
                      <span className="text-muted-foreground">{text.localUrl}</span>
                      <span className="font-medium">127.0.0.1:{environment.port}</span>
                    </div>
                    {environment.extraServices?.includes("node") && (
                      <div className="flex items-center justify-between py-1.5 first:pt-0 last:pb-0">
                        <span className="text-muted-foreground">Node.js</span>
                        <span className="font-medium">
                          {environment.nodeVersion} · {environment.nodePackageManager}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between py-1.5 first:pt-0 last:pb-0">
                      <span className="text-muted-foreground">{text.webServer}</span>
                      <span className="font-medium">
                        {environment.webServer}
                        {environment.webServer === "Nginx" ? ` ${environment.webVersion}` : ""}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 first:pt-0 last:pb-0">
                      <span className="text-muted-foreground">PHP</span>
                      <span className="font-medium">{environment.phpVersion}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 first:pt-0 last:pb-0">
                      <span className="text-muted-foreground">{text.database}</span>
                      <span className="font-medium">
                        {environment.database} {environment.databaseVersion}
                      </span>
                    </div>
                    {Boolean(environment.extraServices?.length) && (
                      <div className="flex items-center justify-between py-1.5 first:pt-0 last:pb-0">
                        <span className="text-muted-foreground">{text.services}</span>
                        <span className="truncate pl-4 text-right font-medium">
                          {environment.extraServices?.join(", ")}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
              <CardFooter className="justify-between">
                <Button variant="outline" size="sm" onClick={() => onEdit(environment)}>
                  <Settings2 />
                  {text.configure}
                </Button>
                <Button
                  size="sm"
                  variant={active ? "destructive" : "default"}
                  onClick={() => onOperate(environment.id, active ? "stop" : "start")}
                >
                  {active ? <Square /> : <Play />}
                  {active ? text.stop : text.start}
                </Button>
              </CardFooter>
            </Card>
          )
        })}
        {!environments.length && (
          <Card className="col-span-full">
            <CardContent className="grid place-items-center gap-3 py-20 text-muted-foreground">
              <Server className="size-8" />
              <p>{text.noEnvironmentsYet}</p>
              <Button onClick={createEnvironment}>
                <Plus />
                {text.createEnvironment}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
      <Dialog
        open={Boolean(diagnosis)}
        onOpenChange={(open) => {
          if (!open) setDiagnosis(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{text.environmentDiagnosis}</DialogTitle>
            <DialogDescription>{diagnosis?.environment.name}</DialogDescription>
          </DialogHeader>
          {diagnosis && !diagnosis.result && !diagnosis.error && (
            <div className="grid place-items-center gap-2 py-10 text-sm text-muted-foreground">
              <RefreshCw className="animate-spin" />
              {text.analyzingRuntime}
            </div>
          )}
          {diagnosis?.error && (
            <Alert variant="destructive">
              <AlertDescription>{diagnosis.error}</AlertDescription>
            </Alert>
          )}
          {diagnosis?.result && (
            <div className="grid gap-3">
              <Alert variant={diagnosis.result.healthy ? "default" : "destructive"}>
                <AlertDescription>{diagnosis.result.summary}</AlertDescription>
              </Alert>
              {diagnosis.result.findings.map((finding, index) => (
                <Card key={`${finding.title}-${index}`}>
                  <CardHeader>
                    <CardTitle className="text-base">{finding.title}</CardTitle>
                    <CardDescription>{finding.explanation}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm">
                    <strong>{text.recommendedAction}</strong>
                    {finding.action}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiagnosis(null)}>
              {text.close}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
