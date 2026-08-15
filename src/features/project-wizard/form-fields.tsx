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
  disabled,
  disabledHint,
}: {
  active: boolean
  icon: React.ReactNode
  title: string
  description: string
  selectedLabel: string
  onClick: () => void
  disabled?: boolean
  disabledHint?: string
}) {
  return (
    <Card
      className={
        disabled
          ? "cursor-not-allowed opacity-50"
          : active
            ? "border-primary ring-1 ring-primary"
            : "cursor-pointer"
      }
      onClick={disabled ? undefined : onClick}
    >
      <CardHeader>
        <div className="mb-2 flex items-center justify-between">
          <span className="grid size-9 place-items-center rounded-lg border">{icon}</span>
          {active && !disabled && <Badge>{selectedLabel}</Badge>}
        </div>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{disabled && disabledHint ? disabledHint : description}</CardDescription>
      </CardHeader>
    </Card>
  )
}
export function Field({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
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
