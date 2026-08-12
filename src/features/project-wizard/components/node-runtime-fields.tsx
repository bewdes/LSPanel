import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { pickLanguage } from "@/i18n"

import { Choice, Field, NumericInput } from "../form-fields"

export function NodeRuntimeFields({
  mode,
  isNodeProject,
  nodeVersion,
  setNodeVersion,
  nodePackageManager,
  setNodePackageManager,
  nodeInstallCommand,
  setNodeInstallCommand,
  nodeDevCommand,
  setNodeDevCommand,
  nodeBuildCommand,
  setNodeBuildCommand,
  nodeStartCommand,
  setNodeStartCommand,
  nodeCommand,
  setNodeCommand,
  nodePort,
  setNodePort,
  runtimeMode,
  setRuntimeMode,
  nodeRunMode,
  setNodeRunMode,
  nodeAutoRestart,
  setNodeAutoRestart,
  nodeInspector,
  setNodeInspector,
  nodeInspectorPort,
  setNodeInspectorPort,
  language,
}: {
  mode: "native" | "container"
  isNodeProject: boolean
  nodeVersion: string
  setNodeVersion: (value: string) => void
  nodePackageManager: string
  setNodePackageManager: (value: string) => void
  nodeInstallCommand: string
  setNodeInstallCommand: (value: string) => void
  nodeDevCommand: string
  setNodeDevCommand: (value: string) => void
  nodeBuildCommand: string
  setNodeBuildCommand: (value: string) => void
  nodeStartCommand: string
  setNodeStartCommand: (value: string) => void
  nodeCommand: string
  setNodeCommand: (value: string) => void
  nodePort: string
  setNodePort: (value: string) => void
  runtimeMode: string
  setRuntimeMode: (value: string) => void
  nodeRunMode: string
  setNodeRunMode: (value: string) => void
  nodeAutoRestart: boolean
  setNodeAutoRestart: (value: boolean) => void
  nodeInspector: boolean
  setNodeInspector: (value: boolean) => void
  nodeInspectorPort: number
  setNodeInspectorPort: (value: number) => void
  language: string
}) {
  const text = pickLanguage(language).projectWizard

  if (mode === "native") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {isNodeProject && (
          <>
            <Field label={text.nodeVersionLabel}>
              <Choice
                value={nodeVersion}
                values={["24", "22", "20", "18"]}
                onChange={setNodeVersion}
              />
            </Field>
            <Field label={text.packageManagerLabel}>
              <Choice
                value={nodePackageManager}
                values={["npm", "pnpm", "yarn"]}
                onChange={setNodePackageManager}
              />
            </Field>
            <Field label={text.devCommandLabel}>
              <Input
                value={nodeDevCommand}
                onChange={(event) => setNodeDevCommand(event.target.value)}
              />
            </Field>
            <Field label={text.buildCommandLabel}>
              <Input
                value={nodeBuildCommand}
                onChange={(event) => setNodeBuildCommand(event.target.value)}
              />
            </Field>
            <Field label={text.startCommandLabel}>
              <Input
                value={nodeStartCommand}
                onChange={(event) => setNodeStartCommand(event.target.value)}
              />
            </Field>
            <Field label={text.fallbackCommandLabel} description={text.fallbackCommandDescription}>
              <Input value={nodeCommand} onChange={(event) => setNodeCommand(event.target.value)} />
            </Field>
            <Field label={text.activeRunCommandLabel}>
              <Choice value={nodeRunMode} values={["dev", "start"]} onChange={setNodeRunMode} />
            </Field>
            <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
              <Checkbox
                checked={nodeAutoRestart}
                onCheckedChange={(checked) => setNodeAutoRestart(Boolean(checked))}
              />
              {text.restartNodeAutomatically}
            </label>
          </>
        )}
        <Field label={text.portLabel}>
          <Input
            inputMode="numeric"
            value={nodePort}
            onChange={(event) => setNodePort(event.target.value)}
          />
        </Field>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={text.nodeVersionLabel}>
        <Choice value={nodeVersion} values={["24", "22", "20", "18"]} onChange={setNodeVersion} />
      </Field>
      <Field label={text.packageManagerLabel}>
        <Choice
          value={nodePackageManager}
          values={["npm", "pnpm", "yarn"]}
          onChange={setNodePackageManager}
        />
      </Field>
      <Field label={text.installCommandLabel}>
        <Input
          value={nodeInstallCommand}
          onChange={(event) => setNodeInstallCommand(event.target.value)}
        />
      </Field>
      <Field label={text.startCommandLabel}>
        <Input
          value={nodeStartCommand}
          onChange={(event) => setNodeStartCommand(event.target.value)}
        />
      </Field>
      <Field label={text.devCommandLabel}>
        <Input value={nodeDevCommand} onChange={(event) => setNodeDevCommand(event.target.value)} />
      </Field>
      <Field label={text.buildCommandLabel}>
        <Input
          value={nodeBuildCommand}
          onChange={(event) => setNodeBuildCommand(event.target.value)}
        />
      </Field>
      <Field label={text.fallbackCommandLabel} description={text.fallbackCommandDescription}>
        <Input value={nodeCommand} onChange={(event) => setNodeCommand(event.target.value)} />
      </Field>
      <Field label={text.portLabel}>
        <Input
          inputMode="numeric"
          value={nodePort}
          onChange={(event) => setNodePort(event.target.value)}
        />
      </Field>
      <Field label={text.modeLabel}>
        <Choice
          value={runtimeMode}
          values={["development", "production"]}
          onChange={setRuntimeMode}
        />
      </Field>
      <Field label={text.activeRunCommandLabel}>
        <Choice value={nodeRunMode} values={["dev", "start"]} onChange={setNodeRunMode} />
      </Field>
      <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
        <Checkbox
          checked={nodeAutoRestart}
          onCheckedChange={(checked) => setNodeAutoRestart(Boolean(checked))}
        />
        {text.restartNodeAutomatically}
      </label>
      <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
        <Checkbox
          checked={nodeInspector}
          onCheckedChange={(checked) => setNodeInspector(Boolean(checked))}
        />
        {text.enableNodeInspector}
      </label>
      <NumericInput
        label={text.inspectorPortLabel}
        value={nodeInspectorPort}
        onChange={setNodeInspectorPort}
      />
    </div>
  )
}
