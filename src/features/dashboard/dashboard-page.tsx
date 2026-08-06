import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { Blocks, Plus, Server } from "lucide-react"

import type { PanelView } from "@/components/app-sidebar"
import { PageHeading } from "@/components/page-heading"
import { pickLanguage } from "@/i18n"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatMetricBytes, parseMetricBytes, sumIo } from "@/lib/format"
import type { Environment, Runtime, Site } from "@/types"
import type { ServiceResource } from "@/features/dashboard/types"

export function Dashboard({
  language,
  sites,
  environments,
  states,
  running,
  runtime,
  onNavigate,
  onSelectSite,
  onCreate,
}: {
  language: string
  sites: Site[]
  environments: Environment[]
  states: Record<string, string>
  running: number
  runtime: Runtime | null
  onNavigate: (view: PanelView) => void
  onSelectSite: (id: string) => void
  onCreate: () => void
}) {
  const [resources, setResources] = React.useState<Record<string, ServiceResource[]>>({})
  const text = pickLanguage(language).dashboard
  React.useEffect(() => {
    let disposed = false
    let loading = false
    const load = async () => {
      if (loading) return
      loading = true
      const entries = await Promise.all(
        environments.map(
          async (environment) =>
            [
              environment.id,
              await invoke<ServiceResource[]>("environment_resources", {
                id: environment.id,
              }).catch(() => []),
            ] as const,
        ),
      )
      if (!disposed) setResources(Object.fromEntries(entries))
      loading = false
    }
    void load()
    const timer = window.setInterval(() => void load(), 10000)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [environments])
  const allResources = Object.values(resources).flat()
  const cpu = allResources.reduce((total, item) => total + (Number.parseFloat(item.cpu) || 0), 0)
  const memory = allResources.reduce(
    (total, item) => total + parseMetricBytes(item.memory.split("/")[0]),
    0,
  )
  const network = allResources.reduce((totals, item) => sumIo(totals, item.networkIo), [0, 0] as [
    number,
    number,
  ])
  const block = allResources.reduce((totals, item) => sumIo(totals, item.blockIo), [0, 0] as [
    number,
    number,
  ])
  const resourceStats = [
    { label: "CPU", value: `${cpu.toFixed(2)}%` },
    { label: text.memory, value: formatMetricBytes(memory) },
    {
      label: "Network I/O",
      value: `${formatMetricBytes(network[0])} / ${formatMetricBytes(network[1])}`,
    },
    {
      label: "Block I/O",
      value: `${formatMetricBytes(block[0])} / ${formatMetricBytes(block[1])}`,
    },
  ]
  return (
    <div className="@container/main min-w-0 flex flex-col gap-4 py-4">
      <PageHeading
        title={text.workspaceOverview}
        description={text.workspaceOverviewDescription}
        action={
          <Button onClick={onCreate}>
            <Plus />
            {text.createSite}
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs @xl/main:grid-cols-3 lg:px-6 dark:*:data-[slot=card]:bg-card">
        <Card className="@container/card min-w-0 py-2">
          <CardHeader>
            <CardDescription>{text.localSites}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[220px]/card:text-3xl">
              {sites.length}
            </CardTitle>
          </CardHeader>
          <CardFooter className="px-4 py-2 text-sm text-muted-foreground">
            {sites.length} {text.projects}
          </CardFooter>
        </Card>
        <Card className="@container/card min-w-0 py-2">
          <CardHeader>
            <CardDescription>{text.environments}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[220px]/card:text-3xl">
              {environments.length}
            </CardTitle>
          </CardHeader>
          <CardFooter className="px-4 py-2 text-sm text-muted-foreground">
            {running} {text.running}
          </CardFooter>
        </Card>
        <Card className="@container/card min-w-0 py-2">
          <CardHeader>
            <CardDescription>{text.containerRuntime}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[220px]/card:text-3xl">
              {runtime?.running ? "Ready" : "Offline"}
            </CardTitle>
            <CardAction>
              <Badge variant={runtime?.running ? "default" : "secondary"}>
                {runtime?.runtime ?? "—"}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="px-4 py-2 text-sm text-muted-foreground">
            {runtime?.composeAvailable
              ? `Compose ${runtime?.version ?? "ready"}`
              : text.composeUnavailable}
          </CardFooter>
        </Card>
      </div>
      <div className="px-4 lg:px-6">
        <Card className="min-w-0 py-3">
          <CardHeader>
            <CardTitle>{text.resourceUsage}</CardTitle>
            <CardDescription>{text.aggregatedAcross(allResources.length)}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 @2xl/main:grid-cols-4">
            {resourceStats.map((stat) => (
              <div key={stat.label} className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">{stat.label}</p>
                <p className="truncate text-xl font-semibold tabular-nums">{stat.value}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <div className="grid items-start gap-4 px-4 @3xl/main:grid-cols-2 lg:px-6">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{text.recentSites}</CardTitle>
            <CardDescription>{text.quickProjectAccess}</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" onClick={() => onNavigate("sites")}>
                {text.viewAll}
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-2">
            {sites.slice(0, 5).map((site) => {
              const environment = environments.find((item) => item.id === site.environmentId)
              const isNative = environment?.runtimeMode === "native"
              return (
                <button
                  key={site.id}
                  onClick={() => onSelectSite(site.id)}
                  className="flex min-w-0 items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted">
                    <Server className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{site.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {isNative ? `127.0.0.1:${environment?.port ?? ""}` : site.domain}
                    </span>
                  </span>
                  <Badge
                    variant={states[site.environmentId] === "running" ? "default" : "secondary"}
                  >
                    {states[site.environmentId] ?? "stopped"}
                  </Badge>
                </button>
              )
            })}
            {!sites.length && (
              <p className="py-8 text-center text-sm text-muted-foreground">{text.noSitesYet}</p>
            )}
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{text.environments}</CardTitle>
            <CardDescription>{text.containerStackStatus}</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" onClick={() => onNavigate("containers")}>
                {text.manage}
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-2">
            {environments.slice(0, 5).map((environment) => (
              <button
                key={environment.id}
                onClick={() => onNavigate("containers")}
                className="flex min-w-0 items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted">
                  <Blocks className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{environment.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {environment.runtimeMode === "native"
                      ? text.nativeRuntimeLabel
                      : `PHP ${environment.phpVersion} · ${environment.database}`}
                  </span>
                </span>
                <Badge variant={states[environment.id] === "running" ? "default" : "secondary"}>
                  {states[environment.id] ?? "stopped"}
                </Badge>
              </button>
            ))}
            {!environments.length && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {text.noEnvironmentsYet}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
