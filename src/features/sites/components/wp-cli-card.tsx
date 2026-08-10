import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { TerminalSquare } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { errorMessage } from "@/lib/errors"
import { pickLanguage } from "@/i18n"
import type { Environment } from "@/types"

import { splitCommandLine } from "../helpers"

export function WpCliCard({
  environment,
  siteName,
  active,
  language,
}: {
  environment: Environment
  siteName: string
  active: boolean
  language: string
}) {
  const text = pickLanguage(language).siteDetails
  const [wpCliCommand, setWpCliCommand] = React.useState("")
  const [wpCliBusy, setWpCliBusy] = React.useState(false)
  const [wpCliOutput, setWpCliOutput] = React.useState("")

  async function runWpCli(command: string) {
    const trimmed = command.trim()
    if (!trimmed) return
    setWpCliBusy(true)
    setWpCliOutput("")
    try {
      const service = environment.webServer === "Nginx" ? "php" : "web"
      await invoke<string>("execute_environment_service_command", {
        id: environment.id,
        service,
        command: [
          "php",
          "-r",
          "$d=file_get_contents('https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar'); if($d===false){exit(2);} file_put_contents('/tmp/lspanel-wpcli.phar',$d);",
        ],
      })
      const args = splitCommandLine(trimmed)
      const output = await invoke<string>("execute_environment_service_command", {
        id: environment.id,
        service,
        command: [
          "php",
          "/tmp/lspanel-wpcli.phar",
          ...args,
          "--allow-root",
          `--path=/var/www/sites/${siteName}/app`,
        ],
      })
      setWpCliOutput(`$ wp ${trimmed}\n${output}`)
    } catch (error) {
      setWpCliOutput(`$ wp ${trimmed}\n${errorMessage(error)}`)
    } finally {
      setWpCliBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>WP-CLI</CardTitle>
        <CardDescription>{text.wpCliDescription}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            className="font-mono"
            value={wpCliCommand}
            onChange={(event) => setWpCliCommand(event.target.value)}
            placeholder="plugin list"
            onKeyDown={(event) => {
              if (event.key === "Enter" && wpCliCommand.trim()) void runWpCli(wpCliCommand)
            }}
          />
          <Button
            disabled={wpCliBusy || !active || !wpCliCommand.trim()}
            onClick={() => void runWpCli(wpCliCommand)}
          >
            <TerminalSquare className={wpCliBusy ? "animate-pulse" : ""} />
            {text.run}
          </Button>
        </div>
        {!active && <p className="text-xs text-muted-foreground">{text.wpCliStartRequired}</p>}
        {wpCliOutput && (
          <Textarea readOnly className="min-h-40 font-mono text-xs" value={wpCliOutput} />
        )}
      </CardContent>
    </Card>
  )
}
