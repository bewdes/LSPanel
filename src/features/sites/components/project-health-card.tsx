import { RefreshCw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { pickLanguage } from "@/i18n"
import type { HealthReport } from "@/features/sites/types"

export function ProjectHealthCard({
  health,
  busy,
  active,
  onCheck,
  language,
}: {
  health: HealthReport | null
  busy: boolean
  active: boolean
  onCheck: () => void
  language: string
}) {
  const text = pickLanguage(language).siteDetails
  return (
    <Card>
      <CardHeader className="flex-row items-center">
        <div>
          <CardTitle className="text-base">{text.projectHealth}</CardTitle>
          <CardDescription>{text.projectHealthDescription}</CardDescription>
        </div>
        <Button className="ml-auto" variant="outline" disabled={busy || !active} onClick={onCheck}>
          <RefreshCw className={busy ? "animate-spin" : ""} />
          {text.runChecks}
        </Button>
      </CardHeader>
      {health && (
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {health.checks.map((item) => (
            <div key={item.code} className="grid gap-1 rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{item.title}</span>
                <Badge
                  variant={
                    item.status === "healthy"
                      ? "default"
                      : item.status === "warning"
                        ? "secondary"
                        : "destructive"
                  }
                >
                  {item.status}
                </Badge>
              </div>
              <p className="text-muted-foreground">{item.summary}</p>
              {item.suggestions.map((suggestion) => (
                <p key={suggestion} className="text-xs text-muted-foreground">
                  {suggestion}
                </p>
              ))}
            </div>
          ))}
        </CardContent>
      )}
      {!active && (
        <CardFooter className="text-sm text-muted-foreground">
          {text.startEnvironmentBeforeChecks}
        </CardFooter>
      )}
    </Card>
  )
}
