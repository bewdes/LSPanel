import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { pickLanguage } from "@/i18n"
import type { Environment } from "@/types"

import { CheckRow, Choice, Field } from "../form-fields"
import { NativeProcessLogs } from "./native-process-logs"

export function NativeModeForm({
  id,
  draft,
  update,
  variables,
  setVariables,
  language,
}: {
  id: string
  draft: Environment
  update: <K extends keyof Environment>(key: K, value: Environment[K]) => void
  variables: string
  setVariables: (value: string) => void
  language: string
}) {
  const text = pickLanguage(language).environmentWindow
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={text.environmentNameLabel}>
          <Input value={draft.name} onChange={(e) => update("name", e.target.value)} />
        </Field>
        <Field label={text.internalPortLabel}>
          <Input value={draft.port} onChange={(e) => update("port", e.target.value)} />
        </Field>
      </div>
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
        </div>
      )}
      <div className="grid gap-2">
        <Label>{text.environmentVariablesLabel}</Label>
        <Textarea
          className="min-h-40 font-mono"
          value={variables}
          onChange={(event) => setVariables(event.target.value)}
          placeholder={"API_KEY=xxxx"}
        />
        <p className="text-xs text-muted-foreground">{text.environmentVariablesHint}</p>
      </div>
      {id && <NativeProcessLogs environmentId={id} language={language} />}
    </div>
  )
}
