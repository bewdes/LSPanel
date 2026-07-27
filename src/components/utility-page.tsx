import * as React from "react"

import { PageHeading } from "@/components/page-heading"
import { PageLoader } from "@/components/page-loader"
import { pickLanguage } from "@/i18n"
import { utilityPageText } from "@/i18n/utility-page"
import { Badge } from "@/components/ui/badge"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import type { Runtime, Site } from "@/types"
import { LiveLinkPage } from "@/features/livelink/live-link-page"

const SystemHealthPage = React.lazy(() =>
  import("@/components/system-health-page").then((module) => ({
    default: module.SystemHealthPage,
  })),
)

export function UtilityPage({
  view,
  uk,
  runtime: _runtime,
  sites,
}: {
  view: "cloud" | "apps" | "help"
  uk: boolean
  runtime: Runtime | null
  sites: Site[]
}) {
  const text = pickLanguage(utilityPageText, uk)
  if (view === "help")
    return (
      <React.Suspense fallback={<PageLoader label={text.systemChecksLoading} />}>
        <SystemHealthPage uk={uk} />
      </React.Suspense>
    )
  if (view === "apps")
    return (
      <div>
        <PageHeading title={text.integrations} description={text.integrationsDescription} />
        <div className="grid gap-4 px-4 md:grid-cols-2 lg:px-6">
          <Card>
            <CardHeader>
              <CardTitle>Visual Studio Code</CardTitle>
              <CardDescription>{text.vsCodeDescription}</CardDescription>
            </CardHeader>
            <CardFooter>
              <Badge variant="outline">CLI: code</Badge>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{text.systemTerminal}</CardTitle>
              <CardDescription>{text.systemTerminalDescription}</CardDescription>
            </CardHeader>
            <CardFooter>
              <Badge variant="outline">{text.autoDetect}</Badge>
            </CardFooter>
          </Card>
        </div>
      </div>
    )
  return <LiveLinkPage sites={sites} uk={uk} />
}
