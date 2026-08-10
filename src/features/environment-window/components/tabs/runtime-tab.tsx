import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { Copy, Settings2, TerminalSquare, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TabsContent } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { errorMessage } from "@/lib/errors"
import { pickLanguage } from "@/i18n"
import type { Environment } from "@/types"

import { Choice, Field } from "../../form-fields"
import { splitCommand } from "../../helpers"
import type { Inspection } from "../../types"

export function RuntimeTab({
  draft,
  update,
  id,
  busy,
  setBusy,
  setMessage,
  inspection,
  inspect,
  language,
}: {
  draft: Environment
  update: <K extends keyof Environment>(key: K, value: Environment[K]) => void
  id: string
  busy: boolean
  setBusy: (value: boolean) => void
  setMessage: (value: string) => void
  inspection: Inspection | null
  inspect: () => Promise<void>
  language: string
}) {
  const text = pickLanguage(language).environmentWindow
  const [serviceDialog, setServiceDialog] = React.useState<{
    name: string
    containerName: string
    configuration: string
  } | null>(null)
  const [serviceCommand, setServiceCommand] = React.useState("")
  const [serviceOutput, setServiceOutput] = React.useState("")

  async function openService(service: string) {
    if (!id) return
    setBusy(true)
    setMessage("")
    setServiceOutput("")
    try {
      const configuration = await invoke<string>("environment_service_configuration", {
        id,
        service,
      })
      const containerName =
        inspection?.services.find((item) => item.name === service)?.containerName ?? service
      setServiceDialog({ name: service, containerName, configuration })
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function executeService() {
    if (!id || !serviceDialog || !serviceCommand.trim()) return
    setBusy(true)
    setServiceOutput("")
    try {
      const command = splitCommand(serviceCommand)
      const output = await invoke<string>("execute_environment_service_command", {
        id,
        service: serviceDialog.name,
        command,
      })
      setServiceOutput(output)
    } catch (error) {
      setServiceOutput(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function clearServiceLogs() {
    if (!id || !serviceDialog) return
    setBusy(true)
    try {
      const output = await invoke<string>("clear_environment_service_logs", {
        id,
        service: serviceDialog.name,
      })
      setServiceOutput(output)
      await inspect()
    } catch (error) {
      setServiceOutput(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function openServiceUrl() {
    if (!id || !serviceDialog) return
    try {
      const url = await invoke<string>("environment_service_url", {
        id,
        service: serviceDialog.name,
      })
      await invoke("open_url", { url })
    } catch (error) {
      setServiceOutput(errorMessage(error))
    }
  }

  return (
    <TabsContent value="runtime" className="grid gap-4 pt-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={text.restartPolicyLabel}>
          <Choice
            value={draft.restartPolicy}
            values={["no", "always", "unless-stopped", "on-failure"]}
            onChange={(value) => update("restartPolicy", value)}
          />
        </Field>
        <Field label={text.cpuLimitLabel}>
          <Input value={draft.cpuLimit} onChange={(e) => update("cpuLimit", e.target.value)} />
        </Field>
        <Field label={text.memoryLimitLabel}>
          <Input
            value={draft.containerMemoryLimit}
            onChange={(e) => update("containerMemoryLimit", e.target.value)}
          />
        </Field>
      </div>
      {id && inspection?.services?.length ? (
        <Card>
          <CardHeader>
            <CardTitle>{text.serviceToolsTitle}</CardTitle>
            <CardDescription>{text.serviceToolsDescription}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {inspection.services.map((service) => (
              <Button
                key={service.name}
                variant="outline"
                disabled={busy}
                onClick={() => void openService(service.name)}
              >
                <Settings2 />
                {service.name}
              </Button>
            ))}
          </CardContent>
        </Card>
      ) : null}
      <Dialog
        open={Boolean(serviceDialog)}
        onOpenChange={(open) => {
          if (!open) {
            setServiceDialog(null)
            setServiceCommand("")
            setServiceOutput("")
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{text.serviceDialogTitle(serviceDialog?.name ?? "")}</DialogTitle>
            <DialogDescription>
              {text.serviceDialogDescription(serviceDialog?.containerName ?? "")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[65vh] gap-4 overflow-auto">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>{text.configurationLabel}</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void navigator.clipboard.writeText(serviceDialog?.configuration ?? "")
                  }
                >
                  <Copy />
                  {text.copy}
                </Button>
              </div>
              <Textarea
                readOnly
                className="min-h-48 font-mono text-xs"
                value={serviceDialog?.configuration ?? ""}
              />
            </div>
            <div className="grid gap-2">
              <Label>{text.containerActionsLabel}</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    void navigator.clipboard.writeText(serviceDialog?.containerName ?? "")
                  }
                >
                  <Copy />
                  {text.copyContainerName}
                </Button>
                <Button variant="outline" onClick={() => void openServiceUrl()}>
                  {text.openInBrowser}
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void clearServiceLogs()}
                >
                  <Trash2 />
                  {text.clearLogs}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{text.clearingLogsHint}</p>
            </div>
            <div className="grid gap-2">
              <Label>{text.executeCommandLabel}</Label>
              <div className="flex gap-2">
                <Input
                  className="font-mono"
                  value={serviceCommand}
                  onChange={(event) => setServiceCommand(event.target.value)}
                  placeholder="php -v"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void executeService()
                  }}
                />
                <Button
                  disabled={busy || !serviceCommand.trim()}
                  onClick={() => void executeService()}
                >
                  <TerminalSquare />
                  {text.run}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{text.executeCommandHint}</p>
            </div>
            {serviceOutput && (
              <Textarea readOnly className="min-h-32 font-mono text-xs" value={serviceOutput} />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setServiceDialog(null)}>
              {text.closeLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TabsContent>
  )
}
