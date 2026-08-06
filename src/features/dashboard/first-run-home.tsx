import { invoke } from "@tauri-apps/api/core"
import { ExternalLink, FolderInput, Plus, Server } from "lucide-react"

import { pickLanguage } from "@/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function FirstRunHome({
  language,
  onCreate,
  onImport,
}: {
  language: string
  onCreate: () => void
  onImport: () => void
}) {
  const text = pickLanguage(language).firstRunHome
  function openExternal(url: string) {
    void invoke("open_url", { url })
  }
  return (
    <main className="flex h-full min-h-0 w-full items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="flex w-full max-w-2xl flex-col gap-6 py-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl border bg-card shadow-sm">
            <Server className="size-5" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{text.title}</h1>
            <p className="text-sm text-muted-foreground">{text.subtitle}</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>{text.createTitle}</CardTitle>
              <CardDescription>{text.createDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={onCreate}>
                <Plus />
                {text.createAction}
              </Button>
            </CardContent>
          </Card>
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>{text.importTitle}</CardTitle>
              <CardDescription>{text.importDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" onClick={onImport}>
                <FolderInput />
                {text.importAction}
              </Button>
            </CardContent>
          </Card>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <button
            className="inline-flex items-center gap-1.5 hover:text-foreground"
            onClick={() => openExternal("https://github.com/bewdes/LSPanel/tree/master/docs")}
          >
            <ExternalLink className="size-3.5" />
            {text.documentation}
          </button>
          <button
            className="inline-flex items-center gap-1.5 hover:text-foreground"
            onClick={() => openExternal("https://github.com/bewdes/LSPanel/releases")}
          >
            <ExternalLink className="size-3.5" />
            {text.releaseNotes}
          </button>
          <button
            className="inline-flex items-center gap-1.5 hover:text-foreground"
            onClick={() => openExternal("https://github.com/bewdes/LSPanel")}
          >
            <ExternalLink className="size-3.5" />
            {text.github}
          </button>
        </div>
      </div>
    </main>
  )
}
