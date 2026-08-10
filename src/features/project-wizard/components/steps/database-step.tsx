import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { pickLanguage } from "@/i18n"
import { DATABASE_VERSIONS, defaultDatabaseVersion } from "@/lib/version-catalog"

import { Choice, Field } from "../../form-fields"

export function DatabaseStep({
  database,
  setDatabase,
  databaseVersion,
  setDatabaseVersion,
  databaseName,
  setDatabaseName,
  databaseUser,
  setDatabaseUser,
  databaseEncoding,
  setDatabaseEncoding,
  sqlDump,
  setSqlDump,
  autoCreateDatabase,
  setAutoCreateDatabase,
  language,
}: {
  database: string
  setDatabase: (value: string) => void
  databaseVersion: string
  setDatabaseVersion: (value: string) => void
  databaseName: string
  setDatabaseName: (value: string) => void
  databaseUser: string
  setDatabaseUser: (value: string) => void
  databaseEncoding: string
  setDatabaseEncoding: (value: string) => void
  sqlDump: string
  setSqlDump: (value: string) => void
  autoCreateDatabase: boolean
  setAutoCreateDatabase: (value: boolean) => void
  language: string
}) {
  const text = pickLanguage(language).projectWizard
  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.databaseLabel}</CardTitle>
        <CardDescription>{text.databaseCardDescription}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={text.engineLabel}>
            <Choice
              value={database}
              values={["MariaDB", "MySQL", "PostgreSQL"]}
              onChange={(value) => {
                setDatabase(value)
                setDatabaseVersion(defaultDatabaseVersion(value))
              }}
            />
          </Field>
          <Field label={text.versionLabel}>
            <Choice
              value={databaseVersion}
              values={DATABASE_VERSIONS[database] ?? []}
              onChange={setDatabaseVersion}
            />
          </Field>
          <Field label={text.databaseNameLabel}>
            <Input value={databaseName} onChange={(event) => setDatabaseName(event.target.value)} />
          </Field>
          <Field label={text.userLabel}>
            <Input value={databaseUser} onChange={(event) => setDatabaseUser(event.target.value)} />
          </Field>
          <Field label={text.encodingLabel}>
            <Choice
              value={databaseEncoding}
              values={["utf8mb4", "utf8", "UTF8"]}
              onChange={setDatabaseEncoding}
            />
          </Field>
          <Field label={text.sqlDumpLabel}>
            <Input
              value={sqlDump}
              onChange={(event) => setSqlDump(event.target.value)}
              placeholder="/path/to/dump.sql"
            />
          </Field>
        </div>
        <label className="flex items-center gap-3 rounded-lg border p-3 text-sm">
          <Checkbox
            checked={autoCreateDatabase}
            onCheckedChange={(value) => setAutoCreateDatabase(Boolean(value))}
          />
          {text.autoCreateDatabaseLabel}
        </label>
      </CardContent>
    </Card>
  )
}
