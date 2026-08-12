import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { Copy, Eye, Play } from "lucide-react"

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
import type { Environment } from "@/types"

import { CheckGrid, CheckRow, Choice, Field, NumberField } from "../../form-fields"
import { nodeInspectorConfiguration, nodeScriptEntries } from "../../helpers"
import { services } from "../../constants"

export function ServicesTab({
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
  const [nodeInspectorConfigOpen, setNodeInspectorConfigOpen] = React.useState(false)
  const [nodeScripts, setNodeScripts] = React.useState<string | null>(null)
  const [nodeScriptOutput, setNodeScriptOutput] = React.useState("")

  async function openNodeScripts() {
    if (!id) return
    setBusy(true)
    setMessage("")
    try {
      const output = await invoke<string>("execute_environment_service_command", {
        id,
        service: "node",
        command: [
          "node",
          "-e",
          "const p=require('./package.json'); console.log(JSON.stringify(p.scripts||{},null,2))",
        ],
      })
      setNodeScripts(output)
      setNodeScriptOutput("")
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function runNodeScript(script: string) {
    if (!id || !nodeScriptEntries(nodeScripts).some(([name]) => name === script)) return
    setBusy(true)
    setNodeScriptOutput("")
    try {
      const output = await invoke<string>("execute_environment_service_command", {
        id,
        service: "node",
        command: [draft.nodePackageManager, "run", script],
      })
      setNodeScriptOutput(output || text.scriptCompleted(script))
    } catch (error) {
      setNodeScriptOutput(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <TabsContent value="services" className="grid gap-5 pt-5">
      <CheckGrid
        title={text.additionalServicesTitle}
        values={services}
        selected={draft.extraServices}
        onToggle={(value) => toggle("extraServices", value)}
      />
      {draft.extraServices.includes("node") && (
        <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
          <Field label={text.nodeVersionLabel}>
            <Input
              value={draft.nodeVersion}
              onChange={(e) => update("nodeVersion", e.target.value)}
            />
          </Field>
          <Field label={text.packageManagerLabel}>
            <Choice
              value={draft.nodePackageManager}
              values={["npm", "pnpm", "yarn"]}
              onChange={(value) => update("nodePackageManager", value)}
            />
          </Field>
          <Field label={text.activeRunCommandLabel}>
            <Choice
              value={draft.nodeRunMode}
              values={["dev", "start"]}
              onChange={(value) => update("nodeRunMode", value)}
            />
          </Field>
          <Field label={text.devCommandLabel}>
            <Input
              value={draft.nodeDevCommand}
              onChange={(e) => update("nodeDevCommand", e.target.value)}
            />
          </Field>
          <Field label={text.buildCommandLabel}>
            <Input
              value={draft.nodeBuildCommand}
              onChange={(e) => update("nodeBuildCommand", e.target.value)}
            />
          </Field>
          <Field label={text.startCommandLabel}>
            <Input
              value={draft.nodeStartCommand}
              onChange={(e) => update("nodeStartCommand", e.target.value)}
            />
          </Field>
          <Field label={text.fallbackCommandLabel} description={text.fallbackCommandDescription}>
            <Input
              value={draft.nodeCommand}
              onChange={(e) => update("nodeCommand", e.target.value)}
            />
          </Field>
          <CheckRow
            label={text.installDepsAutomatically}
            checked={draft.nodeAutoInstall}
            onChange={(value) => update("nodeAutoInstall", value)}
          />
          <CheckRow
            label={text.restartNodeAutomatically}
            checked={draft.nodeAutoRestart}
            onChange={(value) => update("nodeAutoRestart", value)}
          />
          <CheckRow
            label={text.enableNodeInspector}
            checked={draft.nodeInspector}
            onChange={(value) => update("nodeInspector", value)}
          />
          <NumberField
            label={text.inspectorPortLabel}
            value={draft.nodeInspectorPort}
            onChange={(value) => update("nodeInspectorPort", value)}
          />
          <Button
            variant="outline"
            disabled={!draft.nodeInspector}
            onClick={() => setNodeInspectorConfigOpen(true)}
          >
            <Copy />
            {text.generateVsCodeConfig}
          </Button>
          {id && (
            <Button
              variant="outline"
              disabled={!draft.nodeInspector || busy}
              onClick={() =>
                void invoke("open_url", {
                  url: `http://127.0.0.1:${draft.nodeInspectorPort}/json/list`,
                }).catch((error) => setMessage(errorMessage(error)))
              }
            >
              <Eye />
              {text.openInspectorEndpoint}
            </Button>
          )}
          {id && (
            <Button variant="outline" disabled={busy} onClick={() => void openNodeScripts()}>
              <Eye />
              {text.viewPackageScripts}
            </Button>
          )}
        </div>
      )}
      <Dialog open={nodeInspectorConfigOpen} onOpenChange={setNodeInspectorConfigOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{text.vsCodeInspectorConfigTitle}</DialogTitle>
            <DialogDescription>{text.vsCodeInspectorConfigDescription}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void navigator.clipboard.writeText(
                  nodeInspectorConfiguration(draft.nodeInspectorPort),
                )
              }
            >
              <Copy />
              {text.copy}
            </Button>
          </div>
          <pre className="max-h-[60vh] overflow-auto rounded-lg border bg-muted/30 p-4 text-xs whitespace-pre-wrap">
            {nodeInspectorConfiguration(draft.nodeInspectorPort)}
          </pre>
        </DialogContent>
      </Dialog>
      <Dialog
        open={nodeScripts !== null}
        onOpenChange={(open) => {
          if (!open) {
            setNodeScripts(null)
            setNodeScriptOutput("")
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{text.packageJsonScriptsTitle}</DialogTitle>
            <DialogDescription>{text.packageJsonScriptsDescription}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void navigator.clipboard.writeText(nodeScripts ?? "")}
            >
              <Copy />
              {text.copy}
            </Button>
          </div>
          <div className="grid max-h-[60vh] gap-2 overflow-auto">
            {nodeScriptEntries(nodeScripts).map(([name, command]) => (
              <div
                key={name}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{name}</p>
                  <code className="block truncate text-xs text-muted-foreground">{command}</code>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void runNodeScript(name)}
                >
                  <Play />
                  {text.run}
                </Button>
              </div>
            ))}
            {nodeScriptEntries(nodeScripts).length === 0 && (
              <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                {text.noPackageScriptsFound}
              </p>
            )}
          </div>
          {nodeScriptOutput && (
            <pre className="max-h-48 overflow-auto rounded-lg border bg-muted/30 p-4 text-xs whitespace-pre-wrap">
              {nodeScriptOutput}
            </pre>
          )}
        </DialogContent>
      </Dialog>
      {draft.extraServices.includes("redis") && (
        <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
          <Field label={text.redisVersionLabel}>
            <Input
              value={draft.redisVersion}
              onChange={(e) => update("redisVersion", e.target.value)}
            />
          </Field>
          <Field label={text.passwordLabel}>
            <Input
              type="password"
              value={draft.redisPassword}
              onChange={(e) => update("redisPassword", e.target.value)}
            />
          </Field>
          <Field label={text.memoryLabel}>
            <Input
              value={draft.redisMemoryLimit}
              onChange={(e) => update("redisMemoryLimit", e.target.value)}
            />
          </Field>
          <Field label={text.evictionPolicyLabel}>
            <Choice
              value={draft.redisEvictionPolicy}
              values={["noeviction", "allkeys-lru", "allkeys-lfu", "volatile-lru", "volatile-ttl"]}
              onChange={(value) => update("redisEvictionPolicy", value)}
            />
          </Field>
        </div>
      )}
      {draft.extraServices.includes("elasticsearch") && (
        <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
          <Field label={text.elasticsearchVersionLabel}>
            <Input
              value={draft.elasticsearchVersion}
              onChange={(e) => update("elasticsearchVersion", e.target.value)}
            />
          </Field>
          <Field label={text.memoryLabel}>
            <Input
              value={draft.elasticsearchMemoryLimit}
              onChange={(e) => update("elasticsearchMemoryLimit", e.target.value)}
            />
          </Field>
        </div>
      )}
      {draft.extraServices.includes("minio") && (
        <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
          <Field label={text.minioVersionLabel}>
            <Input
              value={draft.minioVersion}
              onChange={(e) => update("minioVersion", e.target.value)}
            />
          </Field>
          <Field label={text.minioRootUserLabel}>
            <Input
              value={draft.minioRootUser}
              onChange={(e) => update("minioRootUser", e.target.value)}
            />
          </Field>
          <Field label={text.passwordLabel}>
            <Input
              type="password"
              value={draft.minioRootPassword}
              onChange={(e) => update("minioRootPassword", e.target.value)}
            />
          </Field>
        </div>
      )}
      {draft.extraServices.includes("rabbitmq") && (
        <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
          <Field label={text.rabbitmqVersionLabel}>
            <Input
              value={draft.rabbitmqVersion}
              onChange={(e) => update("rabbitmqVersion", e.target.value)}
            />
          </Field>
          <Field label={text.rabbitmqUserLabel}>
            <Input
              value={draft.rabbitmqUser}
              onChange={(e) => update("rabbitmqUser", e.target.value)}
            />
          </Field>
          <Field label={text.passwordLabel}>
            <Input
              type="password"
              value={draft.rabbitmqPassword}
              onChange={(e) => update("rabbitmqPassword", e.target.value)}
            />
          </Field>
        </div>
      )}
    </TabsContent>
  )
}
