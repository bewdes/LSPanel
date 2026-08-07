import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { Check, Copy, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { pickLanguage } from "@/i18n"

type GeneratedFile = { name: string; content: string }

export function GeneratedFilesViewer({
  environmentId,
  language,
}: {
  environmentId: string
  language: string
}) {
  const text = pickLanguage(language).siteDetails
  const [files, setFiles] = React.useState<GeneratedFile[]>([])
  const [busy, setBusy] = React.useState(false)
  const [copied, setCopied] = React.useState("")

  const refresh = React.useCallback(async () => {
    setBusy(true)
    try {
      setFiles(await invoke<GeneratedFile[]>("list_generated_files", { id: environmentId }))
    } catch {
      setFiles([])
    } finally {
      setBusy(false)
    }
  }, [environmentId])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const copy = (file: GeneratedFile) => {
    void navigator.clipboard.writeText(file.content).then(() => {
      setCopied(file.name)
      window.setTimeout(() => setCopied(""), 1500)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.generatedFiles}</CardTitle>
        <CardDescription>{text.generatedFilesDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {!files.length ? (
          <p className="text-sm text-muted-foreground">{text.noGeneratedFilesYet}</p>
        ) : (
          <Tabs defaultValue={files[0].name}>
            <div className="flex flex-wrap items-center gap-2">
              <TabsList>
                {files.map((file) => (
                  <TabsTrigger key={file.name} value={file.name}>
                    {file.name}
                  </TabsTrigger>
                ))}
              </TabsList>
              <Button
                className="ml-auto"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void refresh()}
              >
                <RefreshCw className={busy ? "animate-spin" : ""} /> {text.refreshFiles}
              </Button>
            </div>
            {files.map((file) => (
              <TabsContent key={file.name} value={file.name} className="pt-3">
                <div className="mb-2 flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => copy(file)}>
                    {copied === file.name ? <Check /> : <Copy />}
                    {text.copyContents}
                  </Button>
                </div>
                <Textarea readOnly className="min-h-80 font-mono text-xs" value={file.content} />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  )
}
