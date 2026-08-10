import { Input } from "@/components/ui/input"
import { TabsContent } from "@/components/ui/tabs"
import { pickLanguage } from "@/i18n"
import { WEB_SERVER_VERSIONS } from "@/lib/version-catalog"
import type { Environment } from "@/types"

import { Choice, Field } from "../../form-fields"

export function GeneralTab({
  draft,
  update,
  onWebServerChange,
  language,
}: {
  draft: Environment
  update: <K extends keyof Environment>(key: K, value: Environment[K]) => void
  onWebServerChange: (value: string) => void
  language: string
}) {
  const text = pickLanguage(language).environmentWindow
  return (
    <TabsContent value="general" className="grid gap-4 pt-5">
      <Field label={text.environmentNameLabel}>
        <Input value={draft.name} onChange={(e) => update("name", e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={text.webServerLabel}>
          <Choice
            value={draft.webServer}
            values={["Nginx", "Apache"]}
            onChange={onWebServerChange}
          />
        </Field>
        <Field label={text.webServerVersionLabel}>
          {WEB_SERVER_VERSIONS[draft.webServer] ? (
            <Choice
              value={draft.webVersion}
              values={WEB_SERVER_VERSIONS[draft.webServer]}
              onChange={(value) => update("webVersion", value)}
            />
          ) : (
            <p className="pt-2 text-sm text-muted-foreground">{text.bundledWithPhpImage}</p>
          )}
        </Field>
        <Field label={text.webContainerNameLabel}>
          <Input
            value={draft.webContainerName}
            placeholder={`${draft.name}-web`}
            onChange={(e) => update("webContainerName", e.target.value)}
          />
        </Field>
        <Field label={text.internalPortLabel}>
          <Input value={draft.port} onChange={(e) => update("port", e.target.value)} />
        </Field>
      </div>
    </TabsContent>
  )
}
