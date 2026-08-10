import * as React from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { pickLanguage } from "@/i18n"
import { PHP_EXTENSIONS, PHP_VERSIONS } from "@/lib/version-catalog"

import { Choice, Field, NumericInput } from "../form-fields"

export function PhpRuntimeFields({
  phpVersion,
  setPhpVersion,
  composerVersion,
  setComposerVersion,
  runtimeMode,
  setRuntimeMode,
  phpMemoryLimit,
  setPhpMemoryLimit,
  phpUploadLimit,
  setPhpUploadLimit,
  phpExecutionTime,
  setPhpExecutionTime,
  phpExtensions,
  setPhpExtensions,
  phpJit,
  setPhpJit,
  phpJitMode,
  setPhpJitMode,
  phpJitBufferSize,
  setPhpJitBufferSize,
  phpXdebug,
  setPhpXdebug,
  phpXdebugMode,
  setPhpXdebugMode,
  phpXdebugStart,
  setPhpXdebugStart,
  phpXdebugPort,
  setPhpXdebugPort,
  phpXdebugIdeKey,
  setPhpXdebugIdeKey,
  phpCron,
  setPhpCron,
  phpCronSchedule,
  setPhpCronSchedule,
  phpCronCommand,
  setPhpCronCommand,
  phpFpmProcessManager,
  setPhpFpmProcessManager,
  phpFpmMaxChildren,
  setPhpFpmMaxChildren,
  phpFpmMaxRequests,
  setPhpFpmMaxRequests,
  phpFpmStartServers,
  setPhpFpmStartServers,
  phpFpmMinSpareServers,
  setPhpFpmMinSpareServers,
  phpFpmMaxSpareServers,
  setPhpFpmMaxSpareServers,
  webServer,
  language,
}: {
  phpVersion: string
  setPhpVersion: (value: string) => void
  composerVersion: string
  setComposerVersion: (value: string) => void
  runtimeMode: string
  setRuntimeMode: (value: string) => void
  phpMemoryLimit: string
  setPhpMemoryLimit: (value: string) => void
  phpUploadLimit: string
  setPhpUploadLimit: (value: string) => void
  phpExecutionTime: number
  setPhpExecutionTime: (value: number) => void
  phpExtensions: string[]
  setPhpExtensions: React.Dispatch<React.SetStateAction<string[]>>
  phpJit: boolean
  setPhpJit: (value: boolean) => void
  phpJitMode: string
  setPhpJitMode: (value: string) => void
  phpJitBufferSize: string
  setPhpJitBufferSize: (value: string) => void
  phpXdebug: boolean
  setPhpXdebug: (value: boolean) => void
  phpXdebugMode: string
  setPhpXdebugMode: (value: string) => void
  phpXdebugStart: string
  setPhpXdebugStart: (value: string) => void
  phpXdebugPort: number
  setPhpXdebugPort: (value: number) => void
  phpXdebugIdeKey: string
  setPhpXdebugIdeKey: (value: string) => void
  phpCron: boolean
  setPhpCron: (value: boolean) => void
  phpCronSchedule: string
  setPhpCronSchedule: (value: string) => void
  phpCronCommand: string
  setPhpCronCommand: (value: string) => void
  phpFpmProcessManager: string
  setPhpFpmProcessManager: (value: string) => void
  phpFpmMaxChildren: number
  setPhpFpmMaxChildren: (value: number) => void
  phpFpmMaxRequests: number
  setPhpFpmMaxRequests: (value: number) => void
  phpFpmStartServers: number
  setPhpFpmStartServers: (value: number) => void
  phpFpmMinSpareServers: number
  setPhpFpmMinSpareServers: (value: number) => void
  phpFpmMaxSpareServers: number
  setPhpFpmMaxSpareServers: (value: number) => void
  webServer: string
  language: string
}) {
  const text = pickLanguage(language).projectWizard
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={text.phpVersionLabel}>
          <Choice value={phpVersion} values={[...PHP_VERSIONS]} onChange={setPhpVersion} />
        </Field>
        <Field label={text.composerLabel}>
          <Choice
            value={composerVersion}
            values={["2", "2.8", "2.7"]}
            onChange={setComposerVersion}
          />
        </Field>
        <Field label={text.modeLabel}>
          <Choice
            value={runtimeMode}
            values={["development", "production"]}
            onChange={setRuntimeMode}
          />
        </Field>
        <Field label="memory_limit">
          <Input
            value={phpMemoryLimit}
            onChange={(event) => setPhpMemoryLimit(event.target.value)}
          />
        </Field>
        <Field label="upload_max_filesize">
          <Input
            value={phpUploadLimit}
            onChange={(event) => setPhpUploadLimit(event.target.value)}
          />
        </Field>
        <Field label="max_execution_time">
          <Input
            type="number"
            value={phpExecutionTime}
            onChange={(event) => setPhpExecutionTime(Number(event.target.value))}
          />
        </Field>
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        {PHP_EXTENSIONS.map((extension) => (
          <label key={extension} className="flex items-center gap-2 rounded-lg border p-3 text-sm">
            <Checkbox
              checked={phpExtensions.includes(extension)}
              onCheckedChange={() =>
                setPhpExtensions((current) =>
                  current.includes(extension)
                    ? current.filter((item) => item !== extension)
                    : [...current, extension],
                )
              }
            />
            {extension}
          </label>
        ))}
      </div>
      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={phpJit}
            onCheckedChange={(checked) => {
              const enabled = Boolean(checked)
              setPhpJit(enabled)
              if (enabled)
                setPhpExtensions((current) =>
                  current.includes("opcache") ? current : [...current, "opcache"],
                )
            }}
          />
          {text.enablePhpJit}
        </label>
        <Field label={text.jitModeLabel}>
          <Choice value={phpJitMode} values={["tracing", "function"]} onChange={setPhpJitMode} />
        </Field>
        <Field label={text.jitBufferSizeLabel}>
          <Input
            value={phpJitBufferSize}
            onChange={(event) => setPhpJitBufferSize(event.target.value)}
          />
        </Field>
      </div>
      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={phpXdebug}
            onCheckedChange={(checked) => {
              const enabled = Boolean(checked)
              setPhpXdebug(enabled)
              if (enabled)
                setPhpExtensions((current) =>
                  current.includes("xdebug") ? current : [...current, "xdebug"],
                )
            }}
          />
          {text.enableXdebug}
        </label>
        <Field label={text.xdebugModeLabel}>
          <Choice
            value={phpXdebugMode}
            values={["debug", "develop,debug", "debug,coverage"]}
            onChange={setPhpXdebugMode}
          />
        </Field>
        <Field label={text.startWithRequestLabel}>
          <Choice
            value={phpXdebugStart}
            values={["trigger", "yes", "no"]}
            onChange={setPhpXdebugStart}
          />
        </Field>
        <NumericInput
          label={text.debugPortLabel}
          value={phpXdebugPort}
          onChange={setPhpXdebugPort}
        />
        <Field label={text.ideKeyLabel}>
          <Input
            value={phpXdebugIdeKey}
            onChange={(event) => setPhpXdebugIdeKey(event.target.value)}
          />
        </Field>
      </div>
      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <Checkbox checked={phpCron} onCheckedChange={(checked) => setPhpCron(Boolean(checked))} />
          {text.enablePhpCron}
        </label>
        <Field label={text.cronScheduleLabel}>
          <Input
            value={phpCronSchedule}
            disabled={!phpCron}
            placeholder="* * * * *"
            onChange={(event) => setPhpCronSchedule(event.target.value)}
          />
        </Field>
        <Field label={text.commandLabel}>
          <Input
            value={phpCronCommand}
            disabled={!phpCron}
            onChange={(event) => setPhpCronCommand(event.target.value)}
          />
        </Field>
      </div>
      {webServer === "Nginx" && (
        <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
          <Field label={text.phpFpmManagerLabel}>
            <Choice
              value={phpFpmProcessManager}
              values={["dynamic", "ondemand", "static"]}
              onChange={setPhpFpmProcessManager}
            />
          </Field>
          <NumericInput
            label={text.maxChildrenLabel}
            value={phpFpmMaxChildren}
            onChange={setPhpFpmMaxChildren}
          />
          <NumericInput
            label={text.maxRequestsLabel}
            value={phpFpmMaxRequests}
            onChange={setPhpFpmMaxRequests}
          />
          {phpFpmProcessManager === "dynamic" && (
            <>
              <NumericInput
                label={text.startServersLabel}
                value={phpFpmStartServers}
                onChange={setPhpFpmStartServers}
              />
              <NumericInput
                label={text.minSpareServersLabel}
                value={phpFpmMinSpareServers}
                onChange={setPhpFpmMinSpareServers}
              />
              <NumericInput
                label={text.maxSpareServersLabel}
                value={phpFpmMaxSpareServers}
                onChange={setPhpFpmMaxSpareServers}
              />
            </>
          )}
        </div>
      )}
    </>
  )
}
