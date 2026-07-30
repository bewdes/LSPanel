import * as React from "react"
import { invoke } from "@tauri-apps/api/core"

import { PageHeading } from "@/components/page-heading"
import { PageLoader } from "@/components/page-loader"
import { pickLanguage } from "@/i18n"
import { utilityPageText } from "@/i18n/utility-page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import type { Runtime, Site } from "@/types"
import type { AppSettings } from "@/welcome-screen"
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
  settings,
  onSettingsChange,
}: {
  view: "cloud" | "apps" | "help"
  uk: boolean
  runtime: Runtime | null
  sites: Site[]
  settings: AppSettings | null | undefined
  onSettingsChange: (settings: AppSettings) => void
}) {
  const text = pickLanguage(utilityPageText, uk)
  const [status, setStatus] = React.useState("")
  if (view === "help")
    return (
      <React.Suspense fallback={<PageLoader label={text.systemChecksLoading} />}>
        <SystemHealthPage uk={uk} />
      </React.Suspense>
    )
  if (view === "apps") {
    const editors: { id: string; name: string; description: string }[] = [
      { id: "code", name: "Visual Studio Code", description: text.vsCodeDescription },
      { id: "phpstorm", name: "PhpStorm", description: text.phpstormDescription },
      { id: "cursor", name: "Cursor", description: text.cursorDescription },
      { id: "zed", name: "Zed", description: text.zedDescription },
      { id: "sublime", name: "Sublime Text", description: text.sublimeDescription },
      { id: "custom", name: text.customEditorName, description: text.customEditorDescription },
    ]
    async function setPreferredEditor(id: string) {
      if (!settings) return
      try {
        const saved = await invoke<AppSettings>("save_settings", {
          settings: { ...settings, preferredEditor: id },
        })
        onSettingsChange(saved)
        setStatus("")
      } catch (error) {
        setStatus(String(error))
      }
    }
    async function testTerminal() {
      try {
        await invoke("open_terminal", { path: settings?.sitesDirectory })
        setStatus("")
      } catch (error) {
        setStatus(String(error))
      }
    }
    return (
      <div>
        <PageHeading title={text.integrations} description={text.integrationsDescription} />
        <div className="grid gap-4 px-4 md:grid-cols-2 lg:px-6">
          {editors.map((editor) => {
            const active = settings?.preferredEditor === editor.id
            return (
              <Card key={editor.id}>
                <CardHeader>
                  <CardTitle>{editor.name}</CardTitle>
                  <CardDescription>{editor.description}</CardDescription>
                </CardHeader>
                <CardFooter className="flex items-center justify-between gap-2">
                  {active ? (
                    <Badge variant="outline">{text.editorActive}</Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!settings}
                      onClick={() => setPreferredEditor(editor.id)}
                    >
                      {text.setAsDefault}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            )
          })}
          <Card>
            <CardHeader>
              <CardTitle>{text.systemTerminal}</CardTitle>
              <CardDescription>{text.systemTerminalDescription}</CardDescription>
            </CardHeader>
            <CardFooter className="flex items-center justify-between gap-2">
              <Badge variant="outline">{text.autoDetect}</Badge>
              <Button
                variant="outline"
                size="sm"
                disabled={!settings?.sitesDirectory}
                onClick={testTerminal}
              >
                {text.testTerminal}
              </Button>
            </CardFooter>
          </Card>
        </div>
        {status && <p className="px-4 pt-2 text-sm text-muted-foreground lg:px-6">{status}</p>}
      </div>
    )
  }
  return <LiveLinkPage sites={sites} uk={uk} />
}
