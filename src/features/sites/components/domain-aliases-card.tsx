import { Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { pickLanguage } from "@/i18n"

export function DomainAliasesCard({
  aliases,
  setAliases,
  busy,
  onSave,
  language,
}: {
  aliases: string
  setAliases: (value: string) => void
  busy: boolean
  onSave: () => void
  language: string
}) {
  const text = pickLanguage(language).siteDetails
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{text.domainAliases}</CardTitle>
        <CardDescription>{text.domainAliasesDescription}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        <Input
          value={aliases}
          onChange={(event) => setAliases(event.target.value.toLowerCase())}
          placeholder="api.demo.localhost, *.demo.localhost"
        />
        <p className="text-xs text-muted-foreground">{text.aliasesHint}</p>
      </CardContent>
      <CardFooter>
        <Button size="sm" disabled={busy} onClick={onSave}>
          <Save />
          {text.saveAliases}
        </Button>
      </CardFooter>
    </Card>
  )
}
