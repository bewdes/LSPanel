import * as React from "react"
import { ArrowLeft, Container, FileText, Folder } from "lucide-react"

import { PageHeading } from "@/components/page-heading"
import { pickLanguage } from "@/i18n"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LiveLogs } from "@/features/logs/components/live-logs"
import type { Environment, Site } from "@/types"

type Selection = {
  key: string
  title: string
  environment: Environment
  service?: string
}

export function LogsPage({
  sites,
  environments,
  language,
}: {
  sites: Site[]
  environments: Environment[]
  language: string
}) {
  const [selected, setSelected] = React.useState<Selection | null>(null)
  const text = pickLanguage(language).logs
  const environmentById = React.useMemo(
    () => new Map(environments.map((environment) => [environment.id, environment])),
    [environments],
  )
  const containers = environments.flatMap((environment) =>
    [
      "web",
      ...(environment.webServer === "Nginx" ? ["php"] : []),
      "database",
      ...(environment.extraServices ?? []),
    ].map((service) => ({ environment, service })),
  )

  return (
    <div>
      <PageHeading
        title={text.logs}
        description={selected ? selected.title : text.logsDescription}
        action={
          selected ? (
            <Button variant="outline" onClick={() => setSelected(null)}>
              <ArrowLeft />
              {text.allLogs}
            </Button>
          ) : null
        }
      />
      <div className="px-4 pb-6 lg:px-6">
        {selected ? (
          <LiveLogs
            key={selected.key}
            environment={selected.environment}
            initialService={selected.service}
            language={language}
          />
        ) : (
          <Tabs defaultValue="projects">
            <TabsList>
              <TabsTrigger value="projects">
                {text.projects}
                <Badge variant="secondary">{sites.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="containers">
                {text.containers}
                <Badge variant="secondary">{containers.length}</Badge>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="projects" className="pt-4">
              <LogList
                empty={text.noProjectsYet}
                items={sites.flatMap((site) => {
                  const environment = environmentById.get(site.environmentId)
                  return environment
                    ? [
                        {
                          key: site.id,
                          title: site.name,
                          description: site.domain,
                          detail: `${environment.name} · all services`,
                          icon: Folder,
                          onOpen: () =>
                            setSelected({
                              key: `project-${site.id}`,
                              title: `${site.name} · ${site.domain}`,
                              environment,
                            }),
                        },
                      ]
                    : []
                })}
              />
            </TabsContent>
            <TabsContent value="containers" className="pt-4">
              <LogList
                empty={text.noContainersYet}
                items={containers.map(({ environment, service }) => ({
                  key: `${environment.id}-${service}`,
                  title: service,
                  description: environment.name,
                  detail: `${environment.webServer} · ${environment.database}`,
                  icon: Container,
                  onOpen: () =>
                    setSelected({
                      key: `container-${environment.id}-${service}`,
                      title: `${environment.name} · ${service}`,
                      environment,
                      service,
                    }),
                }))}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}

function LogList({
  items,
  empty,
}: {
  items: Array<{
    key: string
    title: string
    description: string
    detail: string
    icon: React.ComponentType<{ className?: string }>
    onOpen: () => void
  }>
  empty: string
}) {
  if (!items.length)
    return (
      <Card>
        <CardContent className="grid min-h-56 place-items-center text-center">
          <div>
            <FileText className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="font-medium">{empty}</p>
          </div>
        </CardContent>
      </Card>
    )
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {items.map(({ key, title, description, detail, icon: Icon, onOpen }) => (
        <button
          key={key}
          type="button"
          className="flex w-full min-w-0 items-center gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/60"
          onClick={onOpen}
        >
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
            <Icon className="size-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{title}</p>
            <p className="truncate text-sm text-muted-foreground">{description}</p>
          </div>
          <p className="hidden max-w-[45%] truncate text-xs text-muted-foreground sm:block">
            {detail}
          </p>
        </button>
      ))}
    </div>
  )
}
