import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { pickLanguage } from "@/i18n"
import type { Environment, Site } from "@/types"

import { Summary } from "../../form-fields"
import type { Settings } from "../../types"

export function ReviewStep({
  projectType,
  name,
  domain,
  settings,
  environmentMode,
  environmentName,
  environment,
  isNative,
  isNodeProject,
  appEnvironment,
  nodeVersion,
  nodePackageManager,
  phpVersion,
  composerVersion,
  database,
  databaseVersion,
  databaseEncoding,
  sourceDirectory,
  repositoryUrl,
  autoInitGit,
  nodePort,
  webServer,
  services,
  conflict,
  language,
}: {
  projectType: string
  name: string
  domain: string
  settings: Settings | null
  environmentMode: "existing" | "new"
  environmentName: string
  environment: Environment | undefined
  isNative: boolean
  isNodeProject: boolean
  appEnvironment: string
  nodeVersion: string
  nodePackageManager: string
  phpVersion: string
  composerVersion: string
  database: string
  databaseVersion: string
  databaseEncoding: string
  sourceDirectory: string
  repositoryUrl: string
  autoInitGit: boolean
  nodePort: string
  webServer: string
  services: string[]
  conflict: Site | undefined
  language: string
}) {
  const text = pickLanguage(language).projectWizard
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{text.reviewProject}</CardTitle>
          <CardDescription>{text.reviewProjectDescription}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Summary label={text.typeLabel} value={text.typeNames[projectType] ?? projectType} />
          <Summary label={text.nameLabel} value={name} />
          <Summary label={text.domainLabel} value={domain} />
          <Summary
            label={text.environmentLabel}
            value={
              environmentMode === "new" ? `${environmentName} (new)` : (environment?.name ?? "—")
            }
          />
          {environmentMode === "new" && (
            <>
              <Summary
                label={text.runtimeLabel}
                value={
                  isNative
                    ? isNodeProject
                      ? `Node.js ${nodeVersion} · ${nodePackageManager}`
                      : text.nativeRuntimeStaticValue
                    : isNodeProject
                      ? `Node.js ${nodeVersion} · ${nodePackageManager} · ${appEnvironment}`
                      : `PHP ${phpVersion} · Composer ${composerVersion} · ${appEnvironment}`
                }
              />
              {!isNative && (
                <Summary label={text.databaseLabel} value={`${database} ${databaseVersion}`} />
              )}
            </>
          )}
          <Summary
            label={text.directoryLabel}
            value={`${settings?.sitesDirectory ?? "LSP Sites"}/${name}`}
          />
          {projectType === "import" && (
            <Summary label={text.importSource} value={sourceDirectory} />
          )}{" "}
          {projectType === "git" && <Summary label={text.repositoryLabel} value={repositoryUrl} />}{" "}
          {projectType !== "git" && projectType !== "import" && (
            <Summary
              label={text.gitLabel}
              value={autoInitGit ? text.initializeMainBranch : text.disabled}
            />
          )}
          <Summary
            label={text.localUrlLabel}
            value={isNative ? text.nativeRuntimeUrlValue(nodePort) : `https://${domain}`}
          />
          <Summary
            label={text.containersLabel}
            value={
              isNative
                ? text.nativeRuntimeContainersValue
                : environmentMode === "existing"
                  ? text.usesSelectedEnvironment
                  : [
                      isNodeProject ? "node" : webServer.toLowerCase(),
                      isNodeProject ? null : "php",
                      "database",
                      ...services,
                    ]
                      .filter(Boolean)
                      .join(", ")
            }
          />
          {!isNative && (
            <Summary label={text.portsLabel} value={text.portsValue(isNodeProject, nodePort)} />
          )}
          {!isNative && (
            <Summary
              label={text.volumesLabel}
              value={text.volumesValue(
                name,
                environmentName || environment?.name || text.environmentFallback,
              )}
            />
          )}
          <Summary
            label={text.environmentLabel}
            value={
              environmentMode === "new"
                ? isNative
                  ? `APP_ENV=${appEnvironment}`
                  : `APP_ENV=${appEnvironment} · DB_CHARSET=${databaseEncoding}`
                : text.inheritedWithoutSecrets
            }
          />
          {!isNative && (
            <Summary
              label={text.estimatedResourcesLabel}
              value={text.estimatedResourcesValue(
                environmentMode === "new" ? 2 + services.length : 0,
              )}
            />
          )}
        </CardContent>
      </Card>
      {conflict && (
        <Alert variant="destructive">
          <AlertDescription>
            {text.creationBlocked(
              conflict.domain === domain ? text.domainWord : text.projectNameWord,
            )}
          </AlertDescription>
        </Alert>
      )}
    </>
  )
}
