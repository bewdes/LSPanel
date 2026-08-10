import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { Server, Zap } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { pickLanguage } from "@/i18n"
import type { Environment } from "@/types"

import { Field, Hint, Summary } from "../../form-fields"

export function EnvironmentStep({
  environments,
  occupiedEnvironmentIds,
  availableEnvironments,
  environmentId,
  setEnvironmentId,
  environment,
  environmentMode,
  setEnvironmentMode,
  environmentName,
  setEnvironmentName,
  environmentNameValid,
  environmentConflict,
  name,
  projectType,
  isNodeProject,
  executionMode,
  setExecutionMode,
  setNodePort,
  language,
  children,
}: {
  environments: Environment[]
  occupiedEnvironmentIds: Set<string>
  availableEnvironments: Environment[]
  environmentId: string
  setEnvironmentId: (id: string) => void
  environment: Environment | undefined
  environmentMode: "existing" | "new"
  setEnvironmentMode: (mode: "existing" | "new") => void
  environmentName: string
  setEnvironmentName: (value: string) => void
  environmentNameValid: boolean
  environmentConflict: boolean
  name: string
  projectType: string
  isNodeProject: boolean
  executionMode: "container" | "native"
  setExecutionMode: (mode: "container" | "native") => void
  setNodePort: (value: string) => void
  language: string
  children: React.ReactNode
}) {
  const text = pickLanguage(language).projectWizard
  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.containerEnvironment}</CardTitle>
        <CardDescription>{text.containerEnvironmentDescription}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={environmentMode === "existing" ? "default" : "outline"}
            disabled={!availableEnvironments.length}
            onClick={() => setEnvironmentMode("existing")}
          >
            <Server />
            {text.existing}
          </Button>
          <Button
            variant={environmentMode === "new" ? "default" : "outline"}
            onClick={() => {
              setEnvironmentMode("new")
              if (!environmentName) setEnvironmentName(`${name}-env`)
            }}
          >
            <Server />
            {text.createNew}
          </Button>
        </div>
        {environmentMode === "existing" ? (
          <>
            <Field label={text.environmentLabel}>
              <Select
                value={environmentId}
                onValueChange={(value) => value && setEnvironmentId(String(value))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={text.selectEnvironment} />
                </SelectTrigger>
                <SelectContent>
                  {environments.map((item) => {
                    const occupied = occupiedEnvironmentIds.has(item.id)
                    return (
                      <SelectItem key={item.id} value={item.id} disabled={occupied}>
                        <span className="flex items-center gap-2">
                          {item.name} · PHP {item.phpVersion}
                          {occupied && <Badge variant="outline">{text.occupiedBadge}</Badge>}
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </Field>
            {!availableEnvironments.length && (
              <Alert>
                <AlertDescription>{text.allEnvironmentsOccupiedHint}</AlertDescription>
              </Alert>
            )}
            {environment && (
              <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3">
                <Summary label={text.webServerLabel} value={environment.webServer} />
                <Summary label="PHP" value={environment.phpVersion} />
                <Summary
                  label={text.databaseLabel}
                  value={`${environment.database} ${environment.databaseVersion}`}
                />
              </div>
            )}
          </>
        ) : (
          <>
            <Field label={text.environmentNameLabel}>
              <Input
                value={environmentName}
                onChange={(event) => setEnvironmentName(event.target.value)}
                placeholder={`${name || "project"}-env`}
              />
              <Hint
                valid={(environmentNameValid && !environmentConflict) || !environmentName}
                text={environmentConflict ? text.environmentNameTaken : text.nameHint}
              />
            </Field>
            {(isNodeProject || projectType === "static") && (
              <div className="grid gap-3 rounded-lg border p-4">
                <Field label={text.executionModeLabel}>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={executionMode === "container" ? "default" : "outline"}
                      onClick={() => setExecutionMode("container")}
                    >
                      <Server />
                      {text.containerRuntime}
                    </Button>
                    <Button
                      type="button"
                      variant={executionMode === "native" ? "default" : "outline"}
                      onClick={() => {
                        setExecutionMode("native")
                        void invoke<number>("allocate_native_port").then((port) =>
                          setNodePort(String(port)),
                        )
                      }}
                    >
                      <Zap />
                      {text.nativeRuntime}
                    </Button>
                  </div>
                </Field>
                {executionMode === "native" && (
                  <p className="text-xs text-muted-foreground">{text.nativeRuntimeHint}</p>
                )}
              </div>
            )}
            {children}
          </>
        )}
      </CardContent>
    </Card>
  )
}
