import React from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { AlertTriangle, CheckCircle2, RotateCw, TerminalSquare, XCircle } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { errorMessage } from "@/lib/errors"
import type { DependencyInstallPlan } from "@/lib/install"

type InstallProgress = {
  tool: string
  stage: string
  message: string
}

type DialogText = {
  warningTitle: string
  warningDescription: string
  adminWarning: string
  detectedPlatform: string
  commands: string
  cancel: string
  confirm: string
  progressTitle: string
  successTitle: string
  failedTitle: string
  close: string
}

export function DependencyInstallDialog({
  plan,
  text,
  onClose,
  onBusyChange,
  onInstalled,
}: {
  plan: DependencyInstallPlan | null
  text: DialogText
  onClose: () => void
  onBusyChange: (tool: string) => void
  onInstalled: (tool: string) => void
}) {
  const [phase, setPhase] = React.useState<"warning" | "installing" | "success" | "failed">(
    "warning",
  )
  const [lines, setLines] = React.useState<string[]>([])
  const [failure, setFailure] = React.useState("")
  const logRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    setPhase("warning")
    setLines([])
    setFailure("")
  }, [plan])
  React.useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [lines])

  async function startInstallation() {
    if (!plan) return
    setPhase("installing")
    setLines([])
    setFailure("")
    onBusyChange(plan.tool)
    let unlisten: (() => void) | undefined
    try {
      unlisten = await listen<InstallProgress>("dependency-install-progress", ({ payload }) => {
        if (payload.tool !== plan.tool) return
        setLines((current) => [...current.slice(-199), payload.message])
      })
      await invoke<string>("install_dependency", { tool: plan.tool })
      setPhase("success")
      onInstalled(plan.tool)
    } catch (value) {
      setFailure(errorMessage(value))
      setPhase("failed")
    } finally {
      unlisten?.()
      onBusyChange("")
    }
  }

  const finished = phase === "success" || phase === "failed"
  return (
    <AlertDialog
      open={Boolean(plan)}
      onOpenChange={(open) => {
        if (!open && phase !== "installing") onClose()
      }}
    >
      <AlertDialogContent className="sm:max-w-xl">
        <AlertDialogHeader>
          <AlertDialogMedia>
            {phase === "warning" && <AlertTriangle className="text-amber-500" />}
            {phase === "installing" && <RotateCw className="animate-spin text-primary" />}
            {phase === "success" && <CheckCircle2 className="text-emerald-500" />}
            {phase === "failed" && <XCircle className="text-destructive" />}
          </AlertDialogMedia>
          <AlertDialogTitle>
            {phase === "warning" && `${text.warningTitle}: ${plan?.title ?? ""}`}
            {phase === "installing" && `${text.progressTitle}: ${plan?.title ?? ""}`}
            {phase === "success" && text.successTitle}
            {phase === "failed" && text.failedTitle}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {phase === "warning" ? text.warningDescription : plan?.title}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {phase === "warning" && (
          <div className="flex min-w-0 flex-col gap-3">
            <div className="text-xs text-muted-foreground">
              {text.detectedPlatform}: {plan?.platform} · {plan?.packageManager}
            </div>
            {plan?.requiresAdmin && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                {text.adminWarning}
              </div>
            )}
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <TerminalSquare className="size-4" />
              {text.commands}
            </div>
            <div className="max-h-56 overflow-auto rounded-lg bg-black p-3 font-mono text-xs text-zinc-200">
              {plan?.commands.map((command, index) => (
                <div key={`${index}-${command}`} className="mb-2 last:mb-0">
                  <span className="select-none text-emerald-400">$ </span>
                  <span className="whitespace-pre-wrap break-all">{command}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {phase !== "warning" && (
          <div
            ref={logRef}
            className="h-64 overflow-auto rounded-lg bg-black p-3 font-mono text-xs text-zinc-200"
            aria-live="polite"
          >
            {lines.map((line, index) => (
              <div key={`${index}-${line}`} className="whitespace-pre-wrap break-all">
                {line}
              </div>
            ))}
            {failure && <div className="mt-2 whitespace-pre-wrap text-red-400">{failure}</div>}
          </div>
        )}

        <AlertDialogFooter>
          {phase === "warning" && (
            <>
              <AlertDialogCancel>{text.cancel}</AlertDialogCancel>
              <AlertDialogAction onClick={() => void startInstallation()}>
                {text.confirm}
              </AlertDialogAction>
            </>
          )}
          {finished && <AlertDialogCancel>{text.close}</AlertDialogCancel>}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
