import { Code2, ExternalLink, Wrench } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { pickLanguage } from "@/i18n"
import { serviceHostname } from "@/lib/format"
import type { Environment, Site } from "@/types"

export function DeveloperToolsCard({
  site,
  environment,
  active,
  open,
  language,
}: {
  site: Site
  environment: Environment
  active: boolean
  open: (command: string, payload: Record<string, string>) => void
  language: string
}) {
  const text = pickLanguage(language).siteDetails
  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.developerTools}</CardTitle>
        <CardDescription>{text.projectActions}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={!active}
          onClick={() => open("repair_site_permissions", { id: site.id })}
        >
          <Wrench />
          {text.repairPermissions}
        </Button>
        {environment.extraServices?.includes("mailpit") && (
          <Button
            variant="outline"
            onClick={() =>
              open("open_url", { url: `https://${serviceHostname("mailpit", environment.name)}` })
            }
          >
            Mailpit <ExternalLink />
          </Button>
        )}
        {site.projectType === "laravel" && (
          <>
            <Button
              variant="outline"
              onClick={() => open("open_url", { url: `https://${site.domain}/telescope` })}
            >
              Telescope <ExternalLink />
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                open("open_editor", { path: `${site.directory}/app/storage/logs/laravel.log` })
              }
            >
              <Code2 />
              {text.laravelLog}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
