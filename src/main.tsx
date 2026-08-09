import React from "react"
import ReactDOM from "react-dom/client"
import type { Root } from "react-dom/client"
import { invoke } from "@tauri-apps/api/core"
import { errorMessage } from "@/lib/errors"
import { listen } from "@tauri-apps/api/event"
import {
  Code2,
  ExternalLink,
  Play,
  Plus,
  Search,
  Server,
  Square,
  TerminalSquare,
} from "lucide-react"

import { AppSidebar, type PanelView } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { PageLoader } from "@/components/page-loader"
import { StandaloneHeader } from "@/components/standalone-header"
import { UtilityPage } from "@/components/utility-page"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { AppSettings } from "@/welcome-screen"
import { ResizeHandles } from "@/components/window-controls"
import { applyTheme } from "@/theme"
import { Dashboard } from "@/features/dashboard/dashboard-page"
import { FirstRunHome } from "@/features/dashboard/first-run-home"
import { SitesPage } from "@/features/sites/sites-page"
import { SiteDetailsPage } from "@/features/sites/site-details-page"
import { ContainersPage } from "@/features/containers/containers-page"
import { DatabasePage } from "@/features/database/database-page"
import { CertificatesPage } from "@/features/certificates/certificates-page"
import { FilesPage } from "@/features/files/files-page"
import { LogsPage } from "@/features/logs/logs-page"
import { MailPage } from "@/features/mail/mail-page"
import { BackupsPage } from "@/features/backups/backups-page"
import { SettingsPage } from "@/features/settings/settings-page"
import type { Environment, Runtime, Site } from "@/types"
import "./styles.css"

type EnvironmentState = { id: string; status: string }

const WelcomeScreen = React.lazy(() =>
  import("@/welcome-screen").then((module) => ({ default: module.WelcomeScreen })),
)
const EnvironmentWindow = React.lazy(() =>
  import("@/environment-window").then((module) => ({ default: module.EnvironmentWindow })),
)
const ProjectWizard = React.lazy(() =>
  import("@/components/project-wizard").then((module) => ({ default: module.ProjectWizard })),
)

function App() {
  const [settings, setSettings] = React.useState<AppSettings | null | undefined>()
  const [view, setView] = React.useState<PanelView>("dashboard")
  const [environments, setEnvironments] = React.useState<Environment[]>([])
  const [sites, setSites] = React.useState<Site[]>([])
  const [states, setStates] = React.useState<Record<string, string>>({})
  const [runtime, setRuntime] = React.useState<Runtime | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [createProjectType, setCreateProjectType] = React.useState<string | undefined>(undefined)
  const [selectedSite, setSelectedSite] = React.useState<string | null>(null)
  const [environmentPage, setEnvironmentPage] = React.useState<string | null>(null)
  const [error, setError] = React.useState("")
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const [paletteSearch, setPaletteSearch] = React.useState("")

  const refresh = React.useCallback(async () => {
    try {
      const [nextEnvironments, nextSites, nextRuntime] = await Promise.all([
        invoke<Environment[]>("list_environments"),
        invoke<Site[]>("list_sites"),
        invoke<Runtime>("container_runtime_status"),
      ])
      setEnvironments(nextEnvironments)
      setSites(nextSites)
      setRuntime(nextRuntime)
      const statuses = await Promise.all(
        nextEnvironments.map(async ({ id }) => {
          try {
            return [
              id,
              (await invoke<EnvironmentState>("environment_status", { id })).status,
            ] as const
          } catch {
            return [id, "unavailable"] as const
          }
        }),
      )
      setStates(Object.fromEntries(statuses))
    } catch (value) {
      setError(errorMessage(value))
    }
  }, [])

  React.useEffect(() => {
    invoke<AppSettings | null>("load_settings")
      .then(setSettings)
      .catch(() => setSettings(null))
  }, [])
  React.useEffect(() => {
    if (settings?.completed) void refresh()
  }, [settings?.completed, refresh])
  React.useEffect(() => {
    const unlisten = listen("environments-changed", () => void refresh())
    return () => {
      void unlisten.then((dispose) => dispose())
    }
  }, [refresh])
  React.useEffect(() => {
    if (settings) applyTheme(settings.theme)
  }, [settings])
  React.useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setPaletteOpen((value) => !value)
      }
    }
    window.addEventListener("keydown", handle)
    return () => window.removeEventListener("keydown", handle)
  }, [])

  if (settings === undefined)
    return (
      <div className="grid size-full grid-rows-[56px_minmax(0,1fr)] bg-background">
        <StandaloneHeader title="LS Panel" />
        <div className="grid place-items-center">
          <div className="grid size-12 place-items-center rounded-xl border bg-black dark:bg-white text-white dark:text-black shadow-sm">
            <Server className="size-5" />
          </div>
        </div>
      </div>
    )
  if (!settings?.completed)
    return (
      <div className="grid size-full grid-rows-[56px_minmax(0,1fr)]">
        <StandaloneHeader title="LS Panel" />
        <div className="min-h-0">
          <React.Suspense fallback={<PageLoader label="Loading setup…" />}>
            <WelcomeScreen onComplete={setSettings} />
          </React.Suspense>
        </div>
      </div>
    )

  const language = settings.language
  const running = Object.values(states).filter((status) => status === "running").length

  async function operate(
    id: string,
    action:
      "start" | "stop" | "restart" | "pause" | "unpause" | "kill" | "rebuild" | "rebuild-no-cache",
  ) {
    try {
      setError("")
      await invoke("operate_environment", { id, action })
      await refresh()
    } catch (value) {
      setError(errorMessage(value))
    }
  }

  async function operateSite(id: string, action: "start" | "stop") {
    try {
      setError("")
      await invoke("operate_site", { id, action })
      await refresh()
    } catch (value) {
      setError(errorMessage(value))
    }
  }

  function openProject(id: string) {
    setPaletteOpen(false)
    setPaletteSearch("")
    setCreateOpen(false)
    setView("sites")
    setSelectedSite(id)
  }
  function openEnvironment(id: string) {
    setPaletteOpen(false)
    setPaletteSearch("")
    setCreateOpen(false)
    setView("containers")
    setEnvironmentPage(id)
  }
  function paletteInvoke(command: string, payload: Record<string, string>) {
    setPaletteOpen(false)
    void invoke(command, payload).catch((value) => setError(errorMessage(value)))
  }

  return (
    <TooltipProvider>
      <SidebarProvider
        defaultOpen={!settings.compactSidebar}
        className={`h-full min-h-0 ${settings.reduceMotion ? "[&_*]:!animate-none [&_*]:!transition-none" : ""}`}
      >
        <AppSidebar
          active={view}
          language={settings.language}
          onNavigate={(nextView) => {
            setCreateOpen(false)
            setView(nextView)
            setEnvironmentPage(null)
            setSelectedSite(null)
          }}
          onOpenSearch={() => setPaletteOpen(true)}
        />
        <SidebarInset className="min-h-0 overflow-hidden">
          <SiteHeader language={language} />
          <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-background">
            {error && (
              <Alert variant="destructive" className="m-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {createOpen ? (
              <React.Suspense fallback={<PageLoader label="Loading project wizard…" />}>
                <ProjectWizard
                  environments={environments}
                  sites={sites}
                  language={language}
                  initialProjectType={createProjectType}
                  onCancel={() => {
                    setCreateOpen(false)
                    setCreateProjectType(undefined)
                  }}
                  onCreated={async (id) => {
                    await refresh()
                    setCreateOpen(false)
                    setCreateProjectType(undefined)
                    setView("sites")
                    setSelectedSite(id)
                  }}
                />
              </React.Suspense>
            ) : (
              <>
                {view === "dashboard" && sites.length === 0 && (
                  <FirstRunHome
                    language={language}
                    onCreate={() => setCreateOpen(true)}
                    onImport={() => {
                      setCreateProjectType("import")
                      setCreateOpen(true)
                    }}
                  />
                )}
                {view === "dashboard" && sites.length > 0 && (
                  <Dashboard
                    language={language}
                    sites={sites}
                    environments={environments}
                    states={states}
                    running={running}
                    runtime={runtime}
                    statsRefreshIntervalSeconds={settings?.statsRefreshIntervalSeconds ?? 10}
                    onNavigate={setView}
                    onSelectSite={openProject}
                    onCreate={() => setCreateOpen(true)}
                  />
                )}
                {view === "sites" && selectedSite === null && (
                  <SitesPage
                    language={language}
                    sites={sites}
                    environments={environments}
                    states={states}
                    statsRefreshIntervalSeconds={settings?.statsRefreshIntervalSeconds ?? 10}
                    onCreate={() => setCreateOpen(true)}
                    onSelect={setSelectedSite}
                    onOperate={operateSite}
                    onImported={async (id) => {
                      await refresh()
                      setSelectedSite(id)
                    }}
                  />
                )}
                {view === "sites" && selectedSite !== null && (
                  <SiteDetailsPage
                    language={language}
                    site={sites.find((item) => item.id === selectedSite)}
                    environment={environments.find(
                      (item) =>
                        item.id === sites.find((site) => site.id === selectedSite)?.environmentId,
                    )}
                    state={
                      sites.find((site) => site.id === selectedSite)?.enabled === false
                        ? "stopped"
                        : states[
                            sites.find((site) => site.id === selectedSite)?.environmentId ?? ""
                          ]
                    }
                    onBack={() => setSelectedSite(null)}
                    onChanged={async () => {
                      setSelectedSite(null)
                      await refresh()
                    }}
                    onOperated={refresh}
                  />
                )}
                {view === "containers" && environmentPage === null && (
                  <ContainersPage
                    language={language}
                    environments={environments}
                    states={states}
                    onOperate={operate}
                    onRefresh={refresh}
                    onEdit={(environment) => setEnvironmentPage(environment.id)}
                    onCreate={() => setEnvironmentPage("")}
                  />
                )}
                {view === "containers" && environmentPage !== null && (
                  <React.Suspense fallback={<PageLoader label="Loading environment editor…" />}>
                    <EnvironmentWindow
                      environmentId={environmentPage}
                      language={language}
                      onBack={() => setEnvironmentPage(null)}
                      onSaved={async (id) => {
                        setEnvironmentPage(id)
                        await refresh()
                      }}
                    />
                  </React.Suspense>
                )}
                {view === "database" && (
                  <DatabasePage environments={environments} sites={sites} language={language} />
                )}
                {view === "files" && (
                  <FilesPage sites={sites} environments={environments} language={language} />
                )}
                {view === "logs" && (
                  <LogsPage sites={sites} environments={environments} language={language} />
                )}
                {view === "mail" && <MailPage environments={environments} language={language} />}
                {view === "backups" && (
                  <BackupsPage sites={sites} environments={environments} language={language} />
                )}
                {view === "certificates" && <CertificatesPage language={language} />}
                {view === "settings" && <SettingsPage settings={settings} onChange={setSettings} />}
                {(view === "cloud" || view === "apps" || view === "help") && (
                  <UtilityPage
                    view={view}
                    language={language}
                    runtime={runtime}
                    sites={sites}
                    states={states}
                    settings={settings}
                    onSettingsChange={setSettings}
                  />
                )}
              </>
            )}
          </main>
        </SidebarInset>
      </SidebarProvider>
      <Dialog
        open={paletteOpen}
        onOpenChange={(open) => {
          setPaletteOpen(open)
          if (!open) setPaletteSearch("")
        }}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-b p-4">
            <DialogTitle>Quick actions</DialogTitle>
            <DialogDescription>
              Search sites and containers, run common actions. Shortcut: Ctrl+K
            </DialogDescription>
          </DialogHeader>
          <div className="relative border-b">
            <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={paletteSearch}
              onChange={(event) => setPaletteSearch(event.target.value)}
              className="h-12 rounded-none border-0 pl-11 shadow-none focus-visible:ring-0"
              placeholder="Search sites and containers…"
            />
          </div>
          <div className="grid max-h-[55vh] gap-1 overflow-y-auto p-2">
            <Button
              variant="ghost"
              className="justify-start"
              onClick={() => {
                setPaletteOpen(false)
                setCreateOpen(true)
              }}
            >
              <Plus />
              Create project
            </Button>
            <Button
              variant="ghost"
              className="justify-start"
              onClick={() => {
                setPaletteOpen(false)
                setView("containers")
                setEnvironmentPage(null)
              }}
            >
              <Server />
              Open containers
            </Button>
            <Separator className="my-1" />
            {(() => {
              const query = paletteSearch.toLowerCase()
              const matchedSites = sites
                .filter((site) =>
                  `${site.name} ${site.domain} ${site.group ?? ""} ${(site.tags ?? []).join(" ")}`
                    .toLowerCase()
                    .includes(query),
                )
                .slice(0, 8)
              const matchedEnvironments = environments
                .filter((environment) =>
                  `${environment.name} ${environment.webServer} ${environment.database}`
                    .toLowerCase()
                    .includes(query),
                )
                .slice(0, 8)
              return (
                <>
                  {matchedSites.length > 0 && (
                    <p className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                      Sites
                    </p>
                  )}
                  {matchedSites.map((site) => {
                    const state = states[site.environmentId] ?? "stopped"
                    return (
                      <div
                        key={site.id}
                        className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted"
                      >
                        <Button
                          variant="ghost"
                          className="h-auto min-w-0 flex-1 justify-start px-2 text-left"
                          onClick={() => openProject(site.id)}
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">{site.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{site.domain}</p>
                          </div>
                        </Button>
                        <Badge variant={state === "running" ? "default" : "secondary"}>
                          {state}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() =>
                            void operate(site.environmentId, state === "running" ? "stop" : "start")
                          }
                          title={state === "running" ? "Stop" : "Start"}
                        >
                          {state === "running" ? <Square /> : <Play />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() =>
                            paletteInvoke("open_url", { url: `https://${site.domain}` })
                          }
                          title="Open site"
                        >
                          <ExternalLink />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => paletteInvoke("open_editor", { path: site.directory })}
                          title="Open editor"
                        >
                          <Code2 />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => paletteInvoke("open_terminal", { path: site.directory })}
                          title="Open terminal"
                        >
                          <TerminalSquare />
                        </Button>
                      </div>
                    )
                  })}
                  {matchedEnvironments.length > 0 && (
                    <p className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                      Containers
                    </p>
                  )}
                  {matchedEnvironments.map((environment) => {
                    const state = states[environment.id] ?? "stopped"
                    return (
                      <div
                        key={environment.id}
                        className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted"
                      >
                        <Button
                          variant="ghost"
                          className="h-auto min-w-0 flex-1 justify-start px-2 text-left"
                          onClick={() => openEnvironment(environment.id)}
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">{environment.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              PHP {environment.phpVersion} · {environment.database}
                            </p>
                          </div>
                        </Button>
                        <Badge variant={state === "running" ? "default" : "secondary"}>
                          {state}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() =>
                            void operate(environment.id, state === "running" ? "stop" : "start")
                          }
                          title={state === "running" ? "Stop" : "Start"}
                        >
                          {state === "running" ? <Square /> : <Play />}
                        </Button>
                      </div>
                    )
                  })}
                  {!matchedSites.length && !matchedEnvironments.length && (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No matching sites or containers.
                    </p>
                  )}
                </>
              )
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}

const container = document.getElementById("root")!
const root = window.__LS_PANEL_REACT_ROOT__ ?? ReactDOM.createRoot(container)
window.__LS_PANEL_REACT_ROOT__ = root
root.render(
  <div className="relative size-full overflow-hidden border bg-background">
    <ResizeHandles />
    <App />
  </div>,
)

declare global {
  interface Window {
    __LS_PANEL_REACT_ROOT__?: Root
  }
}
