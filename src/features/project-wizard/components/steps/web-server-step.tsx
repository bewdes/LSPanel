import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { pickLanguage } from "@/i18n"
import { WEB_SERVER_VERSIONS } from "@/lib/version-catalog"

import { Choice, Field, Summary } from "../../form-fields"

export function WebServerStep({
  webServer,
  setWebServer,
  webVersion,
  setWebVersion,
  domain,
  nodePort,
  language,
}: {
  webServer: string
  setWebServer: (value: string) => void
  webVersion: string
  setWebVersion: (value: string) => void
  domain: string
  nodePort: string
  language: string
}) {
  const text = pickLanguage(language).projectWizard
  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.webServerLabel}</CardTitle>
        <CardDescription>{text.webServerDescription}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label={text.serverLabel}>
          <Choice
            value={webServer}
            values={["Nginx", "Apache"]}
            onChange={(value) => {
              setWebServer(value)
              setWebVersion(WEB_SERVER_VERSIONS[value]?.[0] ?? "2.4")
            }}
          />
        </Field>
        <Field label={text.versionLabel}>
          {WEB_SERVER_VERSIONS[webServer] ? (
            <Choice
              value={webVersion}
              values={WEB_SERVER_VERSIONS[webServer]}
              onChange={setWebVersion}
            />
          ) : (
            <p className="pt-2 text-sm text-muted-foreground">{text.bundledWithPhpImage}</p>
          )}
        </Field>
        <Summary label={text.httpsRouteLabel} value={`https://${domain}`} />
        <Summary label={text.applicationPortLabel} value={nodePort} />
      </CardContent>
    </Card>
  )
}
