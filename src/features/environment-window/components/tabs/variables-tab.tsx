import { Label } from "@/components/ui/label"
import { TabsContent } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { pickLanguage } from "@/i18n"

export function VariablesTab({
  variables,
  setVariables,
  language,
}: {
  variables: string
  setVariables: (value: string) => void
  language: string
}) {
  const text = pickLanguage(language).environmentWindow
  return (
    <TabsContent value="variables" className="grid gap-2 pt-5">
      <Label>{text.environmentVariablesLabel}</Label>
      <Textarea
        className="min-h-64 font-mono"
        value={variables}
        onChange={(event) => setVariables(event.target.value)}
        placeholder={"APP_ENV=local\nDEBUG=true"}
      />
      <p className="text-xs text-muted-foreground">{text.environmentVariablesHint}</p>
    </TabsContent>
  )
}
