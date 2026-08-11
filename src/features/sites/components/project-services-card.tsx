import { Code2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { pickLanguage } from "@/i18n"
import type { Environment, Site } from "@/types"

import type { GitStatus } from "../types"

export function ProjectServicesCard({
  site,
  environment,
  isNative,
  gitStatus,
  busy,
  active,
  onViewPhpInfo,
  language,
}: {
  site: Site
  environment: Environment
  isNative: boolean
  gitStatus: GitStatus | null
  busy: boolean
  active: boolean
  onViewPhpInfo: () => void
  language: string
}) {
  const text = pickLanguage(language).siteDetails
  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">{text.projectServices}</CardTitle>
        <CardDescription>{text.projectServicesDescription}</CardDescription>
      </CardHeader>
      <CardContent className="grid divide-y text-sm">
        <div className="flex items-center justify-between py-1.5 first:pt-0">
          <span className="text-muted-foreground">{text.domain}</span>
          <span className="font-medium">{site.domain}</span>
        </div>
        {isNative ? (
          (site.projectType === "node" || site.projectType === "react") && (
            <div className="flex items-center justify-between py-1.5">
              <span className="text-muted-foreground">Node.js</span>
              <span className="font-medium">
                {environment.nodeVersion} · {environment.nodePackageManager}
              </span>
            </div>
          )
        ) : (
          <>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-muted-foreground">{text.webServer}</span>
              <span className="font-medium">
                {environment.webServer}
                {environment.webServer === "Nginx" ? ` ${environment.webVersion}` : ""}
              </span>
            </div>
            {site.projectType !== "node" && site.projectType !== "react" && (
              <div className="flex items-center justify-between py-1.5">
                <span className="text-muted-foreground">PHP</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{environment.phpVersion}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy || !active}
                    title={text.viewPhpInfo}
                    onClick={onViewPhpInfo}
                  >
                    <Code2 />
                  </Button>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between py-1.5">
              <span className="text-muted-foreground">{text.database}</span>
              <span className="font-medium">
                {environment.database} {environment.databaseVersion}
              </span>
            </div>
          </>
        )}
        <div className="flex items-center justify-between py-1.5 last:pb-0">
          <span className="text-muted-foreground">Git</span>
          <span className="font-medium">
            {gitStatus?.repository
              ? `${gitStatus.branch}${gitStatus.dirty ? ` · ${text.changedFiles(gitStatus.changedFiles)}` : ` · ${text.workingTreeClean}`}`
              : text.gitNotInitialized}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
