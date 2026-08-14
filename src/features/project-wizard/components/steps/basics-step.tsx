import { Folder } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { pickLanguage } from "@/i18n"
import type { Site } from "@/types"

import { Field, Hint } from "../../form-fields"
import type { Settings } from "../../types"

export function BasicsStep({
  name,
  setName,
  setDomain,
  domain,
  nameValid,
  domainValid,
  settings,
  conflict,
  language,
}: {
  name: string
  setName: (value: string) => void
  domain: string
  setDomain: (value: string) => void
  nameValid: boolean
  domainValid: boolean
  settings: Settings | null
  conflict: Site | undefined
  language: string
}) {
  const text = pickLanguage(language).projectWizard
  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.projectBasics}</CardTitle>
        <CardDescription>{text.projectBasicsDescription}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Field label={text.nameLabel}>
          <Input
            autoFocus
            value={name}
            onChange={(event) => {
              const value = event.target.value
              setName(value)
              setDomain(`${value.toLowerCase().replace(/_/g, "-")}.localhost`)
            }}
            placeholder="my-project"
          />
          <Hint
            valid={nameValid || !name}
            text={/^[Ѐ-ӿ]/.test(name) ? text.nameCyrillicHint : text.nameHint}
          />
        </Field>
        <Field label={text.localDomainLabel}>
          <Input
            value={domain}
            onChange={(event) => setDomain(event.target.value.toLowerCase())}
            placeholder="my-project.localhost"
          />
          <Hint
            valid={domainValid || !domain}
            text={/^[Ѐ-ӿ]/.test(domain) ? text.domainCyrillicHint : text.domainHint}
          />
        </Field>
        <Field label={text.directoryLabel}>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
            <Folder className="size-4" />
            <code className="truncate">
              {settings?.sitesDirectory ?? "LSP Sites"}/{name || "project"}
            </code>
          </div>
        </Field>
        {conflict && (
          <Alert variant="destructive">
            <AlertDescription>
              {conflict.domain === domain ? text.domainTaken : text.nameTaken}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
