import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { Copy, Eye } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { TabsContent } from "@/components/ui/tabs"
import { errorMessage } from "@/lib/errors"
import { pickLanguage } from "@/i18n"
import { PHP_EXTENSIONS, PHP_VERSIONS } from "@/lib/version-catalog"
import type { Environment } from "@/types"

import { CheckGrid, CheckRow, Choice, Field, NumberField } from "../../form-fields"
import { xdebugIdeConfiguration } from "../../helpers"

export function PhpTab({
  draft,
  update,
  toggle,
  id,
  busy,
  setBusy,
  setMessage,
  language,
}: {
  draft: Environment
  update: <K extends keyof Environment>(key: K, value: Environment[K]) => void
  toggle: (key: "phpExtensions" | "extraServices", value: string) => void
  id: string
  busy: boolean
  setBusy: (value: boolean) => void
  setMessage: (value: string) => void
  language: string
}) {
  const text = pickLanguage(language).environmentWindow
  const [xdebugIde, setXdebugIde] = React.useState("VS Code")
  const [xdebugConfigOpen, setXdebugConfigOpen] = React.useState(false)
  const [phpInfo, setPhpInfo] = React.useState<string | null>(null)

  async function openPhpInfo() {
    if (!id) return
    setBusy(true)
    setMessage("")
    try {
      const output = await invoke<string>("execute_environment_service_command", {
        id,
        service: draft.webServer === "Nginx" ? "php" : "web",
        command: ["php", "-i"],
      })
      setPhpInfo(output)
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <TabsContent value="php" className="grid gap-5 pt-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={text.phpVersionLabel}>
          <Choice
            value={draft.phpVersion}
            values={[...PHP_VERSIONS]}
            onChange={(value) => update("phpVersion", value)}
          />
        </Field>
        <Field label={text.composerVersionLabel}>
          <Choice
            value={draft.composerVersion}
            values={["2", "2.8", "2.7"]}
            onChange={(value) => update("composerVersion", value)}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="memory_limit">
          <Input
            value={draft.phpMemoryLimit}
            onChange={(e) => update("phpMemoryLimit", e.target.value)}
          />
        </Field>
        <Field label="upload_max">
          <Input
            value={draft.phpUploadLimit}
            onChange={(e) => update("phpUploadLimit", e.target.value)}
          />
        </Field>
        <Field label="post_max">
          <Input
            value={draft.phpPostLimit}
            onChange={(e) => update("phpPostLimit", e.target.value)}
          />
        </Field>
        <Field label="execution time">
          <Input
            type="number"
            value={draft.phpExecutionTime}
            onChange={(e) => update("phpExecutionTime", Number(e.target.value))}
          />
        </Field>
      </div>
      <CheckGrid
        title={text.phpExtensionsTitle}
        values={[...PHP_EXTENSIONS]}
        selected={draft.phpExtensions}
        onToggle={(value) => toggle("phpExtensions", value)}
      />
      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
        <CheckRow
          label={text.enablePhpJit}
          checked={draft.phpJit}
          onChange={(checked) => {
            update("phpJit", checked)
            if (checked && !draft.phpExtensions.includes("opcache"))
              update("phpExtensions", [...draft.phpExtensions, "opcache"])
          }}
        />
        <Field label={text.jitModeLabel}>
          <Choice
            value={draft.phpJitMode}
            values={["tracing", "function"]}
            onChange={(value) => update("phpJitMode", value)}
          />
        </Field>
        <Field label={text.jitBufferSizeLabel}>
          <Input
            value={draft.phpJitBufferSize}
            onChange={(event) => update("phpJitBufferSize", event.target.value)}
          />
        </Field>
      </div>
      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
        <CheckRow
          label={text.enableXdebug}
          checked={draft.phpXdebug}
          onChange={(checked) => {
            update("phpXdebug", checked)
            if (checked && !draft.phpExtensions.includes("xdebug"))
              update("phpExtensions", [...draft.phpExtensions, "xdebug"])
          }}
        />
        <Field label={text.xdebugModeLabel}>
          <Choice
            value={draft.phpXdebugMode}
            values={["debug", "develop,debug", "debug,coverage"]}
            onChange={(value) => update("phpXdebugMode", value)}
          />
        </Field>
        <Field label={text.startWithRequestLabel}>
          <Choice
            value={draft.phpXdebugStart}
            values={["trigger", "yes", "no"]}
            onChange={(value) => update("phpXdebugStart", value)}
          />
        </Field>
        <NumberField
          label={text.debugPortLabel}
          value={draft.phpXdebugPort}
          onChange={(value) => update("phpXdebugPort", value)}
        />
        <Field label={text.ideKeyLabel}>
          <Input
            value={draft.phpXdebugIdeKey}
            onChange={(event) => update("phpXdebugIdeKey", event.target.value)}
          />
        </Field>
        <Field label={text.ideLabel}>
          <Choice value={xdebugIde} values={["VS Code", "PhpStorm"]} onChange={setXdebugIde} />
        </Field>
        <Button
          variant="outline"
          disabled={!draft.phpXdebug}
          onClick={() => setXdebugConfigOpen(true)}
        >
          <Copy />
          {text.generateIdeConfig}
        </Button>
      </div>
      <Dialog open={xdebugConfigOpen} onOpenChange={setXdebugConfigOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{text.xdebugConfigTitle(xdebugIde)}</DialogTitle>
            <DialogDescription>{text.xdebugConfigDescription}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void navigator.clipboard.writeText(xdebugIdeConfiguration(xdebugIde, draft))
              }
            >
              <Copy />
              {text.copy}
            </Button>
          </div>
          <pre className="max-h-[60vh] overflow-auto rounded-lg border bg-muted/30 p-4 text-xs whitespace-pre-wrap">
            {xdebugIdeConfiguration(xdebugIde, draft)}
          </pre>
        </DialogContent>
      </Dialog>
      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
        <CheckRow
          label={text.enablePhpCron}
          checked={draft.phpCron}
          onChange={(checked) => update("phpCron", checked)}
        />
        <div />
        <Field label={text.cronScheduleLabel}>
          <Input
            value={draft.phpCronSchedule}
            disabled={!draft.phpCron}
            placeholder="* * * * *"
            onChange={(event) => update("phpCronSchedule", event.target.value)}
          />
        </Field>
        <Field label={text.commandLabel}>
          <Input
            value={draft.phpCronCommand}
            disabled={!draft.phpCron}
            onChange={(event) => update("phpCronCommand", event.target.value)}
          />
        </Field>
      </div>
      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
        <CheckRow
          label={text.enableBackupSchedule}
          checked={draft.backupScheduleEnabled}
          onChange={(checked) => update("backupScheduleEnabled", checked)}
        />
        <div />
        <Field label={text.backupIntervalLabel}>
          <Choice
            value={String(draft.backupScheduleIntervalHours)}
            values={["1", "6", "12", "24", "168"]}
            onChange={(value) => update("backupScheduleIntervalHours", Number(value))}
          />
        </Field>
        <NumberField
          label={text.backupRetentionLabel}
          value={draft.backupRetentionCount}
          onChange={(value) => update("backupRetentionCount", value)}
        />
      </div>
      {draft.webServer === "Nginx" && (
        <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
          <Field label={text.phpFpmManagerLabel}>
            <Choice
              value={draft.phpFpmProcessManager}
              values={["dynamic", "ondemand", "static"]}
              onChange={(value) => update("phpFpmProcessManager", value)}
            />
          </Field>
          <NumberField
            label={text.maxChildrenLabel}
            value={draft.phpFpmMaxChildren}
            onChange={(value) => update("phpFpmMaxChildren", value)}
          />
          <NumberField
            label={text.maxRequestsLabel}
            value={draft.phpFpmMaxRequests}
            onChange={(value) => update("phpFpmMaxRequests", value)}
          />
          {draft.phpFpmProcessManager === "dynamic" && (
            <>
              <NumberField
                label={text.startServersLabel}
                value={draft.phpFpmStartServers}
                onChange={(value) => update("phpFpmStartServers", value)}
              />
              <NumberField
                label={text.minSpareServersLabel}
                value={draft.phpFpmMinSpareServers}
                onChange={(value) => update("phpFpmMinSpareServers", value)}
              />
              <NumberField
                label={text.maxSpareServersLabel}
                value={draft.phpFpmMaxSpareServers}
                onChange={(value) => update("phpFpmMaxSpareServers", value)}
              />
            </>
          )}
        </div>
      )}
      {id && (
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">{text.phpInformationTitle}</p>
            <p className="text-xs text-muted-foreground">{text.phpInformationDescription}</p>
          </div>
          <Button variant="outline" disabled={busy} onClick={() => void openPhpInfo()}>
            <Eye />
            {text.viewPhpInfo}
          </Button>
        </div>
      )}
      <Dialog open={phpInfo !== null} onOpenChange={(open) => !open && setPhpInfo(null)}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{text.phpInfoDialogTitle}</DialogTitle>
            <DialogDescription>{text.phpInfoDialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void navigator.clipboard.writeText(phpInfo ?? "")}
            >
              <Copy />
              {text.copy}
            </Button>
          </div>
          <pre className="max-h-[65vh] overflow-auto rounded-lg border bg-muted/30 p-4 text-xs whitespace-pre-wrap">
            {phpInfo}
          </pre>
        </DialogContent>
      </Dialog>
    </TabsContent>
  )
}
