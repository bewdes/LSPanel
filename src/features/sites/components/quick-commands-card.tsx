import { Play, TerminalSquare } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { pickLanguage } from "@/i18n"

import { projectQuickCommands } from "../helpers"

export function QuickCommandsCard({
  projectType,
  customCommand,
  setCustomCommand,
  output,
  busy,
  active,
  onRun,
  language,
}: {
  projectType: string | undefined
  customCommand: string
  setCustomCommand: (value: string) => void
  output: string
  busy: boolean
  active: boolean
  onRun: (command: string) => void
  language: string
}) {
  const text = pickLanguage(language).siteDetails
  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.quickCommands}</CardTitle>
        <CardDescription>{text.quickCommandsDescription}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          {projectQuickCommands(projectType).map((command) => (
            <Button
              key={command}
              variant="outline"
              disabled={busy || !active}
              onClick={() => onRun(command)}
            >
              <Play />
              {command}
            </Button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            className="font-mono"
            value={customCommand}
            onChange={(event) => setCustomCommand(event.target.value)}
            placeholder={projectType === "node" ? "npm run build" : "php -v"}
            onKeyDown={(event) => {
              if (event.key === "Enter" && customCommand.trim()) onRun(customCommand)
            }}
          />
          <Button
            disabled={busy || !active || !customCommand.trim()}
            onClick={() => onRun(customCommand)}
          >
            <TerminalSquare />
            {text.run}
          </Button>
        </div>
        {!active && (
          <p className="text-xs text-muted-foreground">{text.startEnvironmentToRunCommands}</p>
        )}
        {output && <Textarea readOnly className="min-h-40 font-mono text-xs" value={output} />}
      </CardContent>
    </Card>
  )
}
