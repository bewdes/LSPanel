import { Folder } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { pickLanguage } from "@/i18n"

export function ImportSourcePanel({
  sourceDirectory,
  chooseImportDirectory,
  language,
}: {
  sourceDirectory: string
  chooseImportDirectory: () => Promise<void>
  language: string
}) {
  const text = pickLanguage(language).projectWizard
  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.importSource}</CardTitle>
        <CardDescription>{text.importSourceDescription}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Button
          variant="outline"
          className="justify-start"
          onClick={() => void chooseImportDirectory()}
        >
          <Folder />
          {sourceDirectory || text.chooseDirectory}
        </Button>
        {!sourceDirectory && (
          <p className="text-xs text-destructive">{text.chooseDirectoryRequired}</p>
        )}
      </CardContent>
    </Card>
  )
}
