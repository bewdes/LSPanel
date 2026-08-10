import { Input } from "@/components/ui/input"
import { TabsContent } from "@/components/ui/tabs"
import { pickLanguage } from "@/i18n"
import { DATABASE_VERSIONS } from "@/lib/version-catalog"
import type { Environment } from "@/types"

import { Choice, Field, SecretInput } from "../../form-fields"

export function DatabaseTab({
  draft,
  update,
  onDatabaseChange,
  language,
}: {
  draft: Environment
  update: <K extends keyof Environment>(key: K, value: Environment[K]) => void
  onDatabaseChange: (value: string) => void
  language: string
}) {
  const text = pickLanguage(language).environmentWindow
  return (
    <TabsContent value="database" className="grid gap-4 pt-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={text.engineLabel}>
          <Choice
            value={draft.database}
            values={["MySQL", "MariaDB", "PostgreSQL"]}
            onChange={onDatabaseChange}
          />
        </Field>
        <Field label={text.versionLabel}>
          <Choice
            value={draft.databaseVersion}
            values={DATABASE_VERSIONS[draft.database] ?? []}
            onChange={(value) => update("databaseVersion", value)}
          />
        </Field>
        <Field label={text.containerNameLabel}>
          <Input
            value={draft.databaseContainerName}
            placeholder={`${draft.name}-database`}
            onChange={(e) => update("databaseContainerName", e.target.value)}
          />
        </Field>
        <Field label={text.databaseLabel}>
          <Input
            value={draft.databaseName}
            onChange={(e) => update("databaseName", e.target.value)}
          />
        </Field>
        <Field label={text.userLabel}>
          <Input
            value={draft.databaseUser}
            onChange={(e) => update("databaseUser", e.target.value)}
          />
        </Field>
        <Field label={text.passwordLabel}>
          <SecretInput
            value={draft.databasePassword}
            language={language}
            onChange={(value) => update("databasePassword", value)}
          />
        </Field>
        <Field label={text.rootPasswordLabel}>
          <SecretInput
            value={draft.databaseRootPassword}
            language={language}
            onChange={(value) => update("databaseRootPassword", value)}
          />
        </Field>
      </div>
    </TabsContent>
  )
}
