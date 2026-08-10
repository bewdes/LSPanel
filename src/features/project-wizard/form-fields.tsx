import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { pickLanguage } from "@/i18n"
import type { Environment } from "@/types"

export function TypeCard({
  active,
  icon,
  title,
  description,
  selectedLabel,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  title: string
  description: string
  selectedLabel: string
  onClick: () => void
}) {
  return (
    <Card
      className={active ? "border-primary ring-1 ring-primary" : "cursor-pointer"}
      onClick={onClick}
    >
      <CardHeader>
        <div className="mb-2 flex items-center justify-between">
          <span className="grid size-9 place-items-center rounded-lg border">{icon}</span>
          {active && <Badge>{selectedLabel}</Badge>}
        </div>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  )
}
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
export function Hint({ valid, text }: { valid: boolean; text: string }) {
  return (
    <p className={valid ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>{text}</p>
  )
}
export function NumericInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </Field>
  )
}
export function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium">{value}</p>
    </div>
  )
}
export function ExistingEnvironmentNotice({
  environment,
  language,
}: {
  environment?: Environment
  language: string
}) {
  const text = pickLanguage(language).projectWizard
  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.inheritedEnvironmentSettings}</CardTitle>
        <CardDescription>{text.inheritedEnvironmentDescription}</CardDescription>
      </CardHeader>
      {environment && (
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Summary label={text.webServerLabel} value={environment.webServer} />
          <Summary label="PHP" value={environment.phpVersion} />
          <Summary
            label={text.databaseLabel}
            value={`${environment.database} ${environment.databaseVersion}`}
          />
        </CardContent>
      )}
    </Card>
  )
}
export function Choice({
  value,
  values,
  onChange,
}: {
  value: string
  values: string[]
  onChange: (value: string) => void
}) {
  return (
    <Select value={value} onValueChange={(next) => next && onChange(String(next))}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {values.map((item) => (
          <SelectItem key={item} value={item}>
            {item}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
