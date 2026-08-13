import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { open as openDialog } from "@tauri-apps/plugin-dialog"
import {
  ArrowLeft,
  Archive,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Folder,
  KeyRound,
  Pin,
  Play,
  Settings2,
  Square,
  TerminalSquare,
  Trash2,
} from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { errorMessage } from "@/lib/errors"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Credential } from "@/components/credential"
import { DatabaseConsole } from "@/features/database/components/database-console"
import { GeneratedFilesViewer } from "@/features/environment-files/components/generated-files"
import { ProjectEnvironmentEditor } from "@/features/environment-files/components/project-environment-editor"
import { ProjectSnapshots } from "@/features/snapshots/components/project-snapshots"
import { DatabaseBackups } from "@/features/backups/components/database-backups"
import { pickLanguage } from "@/i18n"
import { serviceHostname } from "@/lib/format"
import type { Environment, Site } from "@/types"
import type { HealthReport } from "@/features/sites/types"

import { CheckoutConflictDialog } from "./components/checkout-conflict-dialog"
import { DeleteSiteDialog } from "./components/delete-site-dialog"
import { DeveloperToolsCard } from "./components/developer-tools-card"
import { DomainAliasesCard } from "./components/domain-aliases-card"
import { DuplicateProjectDialog } from "./components/duplicate-project-dialog"
import { EditProjectDialog } from "./components/edit-project-dialog"
import { ProjectHealthCard } from "./components/project-health-card"
import { ProjectServicesCard } from "./components/project-services-card"
import { QuickCommandsCard } from "./components/quick-commands-card"
import { SiteGitPanel } from "./components/site-git-panel"
import { WpCliCard } from "./components/wp-cli-card"
import { splitCommandLine } from "./helpers"
import { useSiteGit } from "./use-site-git"

const ContainerTerminal = React.lazy(() =>
  import("@/components/container-terminal").then((module) => ({
    default: module.ContainerTerminal,
  })),
)

export function SiteDetailsPage({
  language,
  site,
  environment,
  state,
  onBack,
  onChanged,
  onOperated,
}: {
  language: string
  site?: Site
  environment?: Environment
  state?: string
  onBack: () => void
  onChanged: () => void
  onOperated: () => void
}) {
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState("")
  const [messageOk, setMessageOk] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleteFiles, setDeleteFiles] = React.useState(true)
  const [quickOutput, setQuickOutput] = React.useState("")
  const [customCommand, setCustomCommand] = React.useState("")
  const [projectHealth, setProjectHealth] = React.useState<HealthReport | null>(null)
  const [phpInfo, setPhpInfo] = React.useState<string | null>(null)
  const [editOpen, setEditOpen] = React.useState(false)
  const [editName, setEditName] = React.useState(site?.name ?? "")
  const [editDomain, setEditDomain] = React.useState(site?.domain ?? "")
  const [editGroup, setEditGroup] = React.useState(site?.group ?? "")
  const [editTags, setEditTags] = React.useState((site?.tags ?? []).join(", "))
  const [editAliases, setEditAliases] = React.useState((site?.aliases ?? []).join(", "))
  const [duplicateOpen, setDuplicateOpen] = React.useState(false)
  const [duplicateName, setDuplicateName] = React.useState("")
  const [duplicateDomain, setDuplicateDomain] = React.useState("")
  const [duplicateProgress, setDuplicateProgress] = React.useState<{
    progress: number
    stage: string
  } | null>(null)
  const text = pickLanguage(language).siteDetails
  React.useEffect(() => {
    setEditName(site?.name ?? "")
    setEditDomain(site?.domain ?? "")
    setEditGroup(site?.group ?? "")
    setEditTags((site?.tags ?? []).join(", "))
    setEditAliases((site?.aliases ?? []).join(", "))
  }, [site?.id, site?.name, site?.domain, site?.group, site?.tags, site?.aliases])
  const git = useSiteGit(
    site ?? { id: "", name: "", domain: "", environmentId: "", directory: "" },
    { setBusy, setMessage, setMessageOk },
    language,
  )
  if (!site || !environment)
    return <EmptyPage title={text.notFoundTitle} description={text.notFoundDescription} />
  const currentSite = site
  const currentEnvironment = environment
  const isNative = currentEnvironment.runtimeMode === "native"
  const siteUrl = `https://${site.domain}`
  const active = state === "running"
  const open = (command: string, payload: Record<string, string>) =>
    invoke(command, payload).catch((error) => {
      setMessage(errorMessage(error))
      setMessageOk(false)
    })
  async function operate() {
    setBusy(true)
    setMessage("")
    try {
      await invoke("operate_site", {
        id: currentSite.id,
        action: active ? "stop" : "start",
      })
      await onOperated()
    } catch (error) {
      setMessage(errorMessage(error))
      setMessageOk(false)
    } finally {
      setBusy(false)
    }
  }
  async function remove() {
    setBusy(true)
    setMessage("")
    try {
      await invoke("delete_site", { id: currentSite.id, deleteFiles })
      setDeleteOpen(false)
      await onChanged()
    } catch (error) {
      setMessage(errorMessage(error))
      setMessageOk(false)
      setBusy(false)
    }
  }
  async function updateProject(
    values: {
      name?: string
      domain?: string
      pinned?: boolean
      archived?: boolean
      group?: string
      tags?: string[]
      aliases?: string[]
    },
    options: { close?: boolean } = { close: true },
  ) {
    setBusy(true)
    setMessage("")
    try {
      await invoke("update_site", {
        id: currentSite.id,
        name: values.name ?? currentSite.name,
        domain: values.domain ?? currentSite.domain,
        pinned: values.pinned ?? Boolean(currentSite.pinned),
        archived: values.archived ?? Boolean(currentSite.archived),
        group: values.group ?? currentSite.group ?? "",
        tags: values.tags ?? currentSite.tags ?? [],
        aliases: values.aliases ?? currentSite.aliases ?? [],
      })
      setEditOpen(false)
      if (options.close) await onChanged()
      else await onOperated()
      // Only the close:false path (used by the Pin/Archive toggles below,
      // which deliberately stay on this page instead of navigating away)
      // needs this: the close:true path's onChanged() already leaves this
      // page, so busy never mattered there before. Without it, busy stuck
      // true forever after the first successful toggle, permanently
      // disabling every other busy-gated button on this page.
      setBusy(false)
    } catch (error) {
      setMessage(errorMessage(error))
      setMessageOk(false)
      setBusy(false)
    }
  }
  async function duplicateProject() {
    setBusy(true)
    setMessage("")
    setDuplicateProgress({ progress: 0, stage: "" })
    const unlisten = await listen<{ kind: string; progress: number; stage: string }>(
      "operation-progress",
      ({ payload }) => {
        if (payload.kind !== "duplicate-project") return
        setDuplicateProgress({ progress: payload.progress, stage: payload.stage })
      },
    )
    try {
      await invoke("duplicate_site", {
        id: currentSite.id,
        name: duplicateName,
        domain: duplicateDomain,
      })
      setDuplicateOpen(false)
      await onChanged()
    } catch (error) {
      setMessage(errorMessage(error))
      setMessageOk(false)
      setBusy(false)
    } finally {
      unlisten()
      setDuplicateProgress(null)
    }
  }
  async function exportProject() {
    const destination = await openDialog({ directory: true, multiple: false })
    if (typeof destination !== "string") return
    setBusy(true)
    setMessage("")
    try {
      const path = await invoke<string>("export_project", {
        siteId: currentSite.id,
        destination,
      })
      setMessage(text.exportSuccessMessage(path))
      setMessageOk(true)
    } catch (error) {
      setMessage(errorMessage(error))
      setMessageOk(false)
    } finally {
      setBusy(false)
    }
  }
  async function runQuickCommand(command: string) {
    setBusy(true)
    setQuickOutput("")
    try {
      const args = splitCommandLine(command)
      const service =
        currentSite.projectType === "node" || currentSite.projectType === "react"
          ? "node"
          : currentEnvironment.webServer === "Nginx"
            ? "php"
            : "web"
      const output = await invoke<string>("execute_environment_service_command", {
        id: currentEnvironment.id,
        service,
        command: args,
      })
      setQuickOutput(`$ ${command}\n${output}`)
    } catch (error) {
      setQuickOutput(`$ ${command}\n${errorMessage(error)}`)
    } finally {
      setBusy(false)
    }
  }
  async function checkProjectHealth() {
    setBusy(true)
    setMessage("")
    try {
      setProjectHealth(await invoke<HealthReport>("project_health", { siteId: currentSite.id }))
    } catch (error) {
      setMessage(errorMessage(error))
      setMessageOk(false)
    } finally {
      setBusy(false)
    }
  }
  async function loadPhpInfo() {
    setBusy(true)
    setMessage("")
    try {
      const service = currentEnvironment.webServer === "Nginx" ? "php" : "web"
      setPhpInfo(
        await invoke<string>("execute_environment_service_command", {
          id: currentEnvironment.id,
          service,
          command: ["php", "-i"],
        }),
      )
    } catch (error) {
      setMessage(errorMessage(error))
      setMessageOk(false)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="grid gap-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={onBack}>
          <ArrowLeft />
        </Button>
        <div className="min-w-0">
          <h2 className="truncate text-2xl font-semibold tracking-tight">{site.name}</h2>
          <p className="text-sm text-muted-foreground">{site.domain}</p>
        </div>
        <Badge className="ml-auto" variant={active ? "default" : "secondary"}>
          {state ?? text.stoppedFallback}
        </Badge>
        <Button variant={active ? "destructive" : "default"} disabled={busy} onClick={operate}>
          {active ? <Square /> : <Play />}
          {active ? text.stop : text.start}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => open("open_path", { path: site.directory })}
        >
          <Folder />
          {text.folder}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => open("open_terminal", { path: site.directory })}
        >
          <TerminalSquare />
          {text.shell}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => open("open_editor", { path: `${site.directory}/app` })}
        >
          <Code2 />
          VS Code
        </Button>
        <Button variant="outline" size="sm" onClick={() => open("open_url", { url: siteUrl })}>
          <ExternalLink />
          {text.openSite}
        </Button>
        {site.projectType === "wordpress" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => open("open_url", { url: `https://${site.domain}/wp-admin` })}
          >
            <KeyRound />
            {text.admin}
          </Button>
        )}
        <Button
          className="ml-auto"
          variant={site.pinned ? "secondary" : "ghost"}
          size="icon-sm"
          disabled={busy}
          onClick={() => void updateProject({ pinned: !site.pinned }, { close: false })}
        >
          <Pin />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => setEditOpen(true)}>
          <Settings2 />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            const next = `${site.name}-copy`
            setDuplicateName(next)
            setDuplicateDomain(`${next.replace(/_/g, "-")}.localhost`)
            setDuplicateOpen(true)
          }}
        >
          <Copy />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={busy}
          title={text.exportProject}
          onClick={() => void exportProject()}
        >
          <Download />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={busy}
          onClick={() => void updateProject({ archived: !site.archived }, { close: false })}
        >
          <Archive />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => setDeleteOpen(true)}>
          <Trash2 />
        </Button>
      </div>
      {message && (
        <Alert variant={messageOk ? "default" : "destructive"}>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{text.tabOverview}</TabsTrigger>
          {!isNative && <TabsTrigger value="database">{text.tabDatabase}</TabsTrigger>}
          {!(isNative && site.projectType === "static") && (
            <TabsTrigger value="environment">{text.tabEnvironment}</TabsTrigger>
          )}
          <TabsTrigger value="terminal" disabled={busy || !active}>
            {text.tabTerminal}
          </TabsTrigger>
          <TabsTrigger value="backups">{text.tabBackups}</TabsTrigger>
          <TabsTrigger value="tools">{text.tabTools}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="grid gap-4 pt-4 md:grid-cols-2">
          <ProjectServicesCard
            site={site}
            environment={environment}
            isNative={isNative}
            gitStatus={git.status}
            busy={busy}
            active={active}
            onViewPhpInfo={() => void loadPhpInfo()}
            language={language}
          />
          <DomainAliasesCard
            aliases={editAliases}
            setAliases={setEditAliases}
            busy={busy}
            onSave={() => void updateProject({ aliases: editAliases.split(",") })}
            language={language}
          />
          <ProjectHealthCard
            health={projectHealth}
            busy={busy}
            active={active}
            onCheck={() => void checkProjectHealth()}
            language={language}
          />
        </TabsContent>
        {!isNative && (
          <TabsContent value="database" className="grid gap-4 pt-4">
            <Card>
              <CardHeader>
                <CardTitle>{environment.database}</CardTitle>
                <CardDescription>{environment.databaseName ?? "app"}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <Credential label={text.host} value="database" language={language} />
                <Credential
                  label={text.user}
                  value={environment.databaseUser ?? "app"}
                  language={language}
                />
                <Credential
                  label={text.password}
                  value={environment.databasePassword ?? ""}
                  secret
                  language={language}
                />
                {site.projectType === "wordpress" && (
                  <>
                    <Credential
                      label={text.wordpressAdmin}
                      value={environment.wordpressAdminUser ?? "admin"}
                      language={language}
                    />
                    <Credential
                      label={text.wordpressPassword}
                      value={environment.wordpressAdminPassword ?? ""}
                      secret
                      language={language}
                    />
                  </>
                )}
              </CardContent>
              <CardFooter className="gap-2">
                {environment.extraServices?.includes("adminer") && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      open("open_url", {
                        url: `https://${serviceHostname("adminer", environment.name)}`,
                      })
                    }
                  >
                    Adminer <ExternalLink />
                  </Button>
                )}
                {environment.extraServices?.includes("phpmyadmin") && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      open("open_url", {
                        url: `https://${serviceHostname("phpmyadmin", environment.name)}`,
                      })
                    }
                  >
                    phpMyAdmin <ExternalLink />
                  </Button>
                )}
              </CardFooter>
            </Card>
            <DatabaseConsole environment={environment} language={language} />
          </TabsContent>
        )}
        {!(isNative && site.projectType === "static") && (
          <TabsContent value="environment" className="grid gap-4 pt-4">
            <ProjectEnvironmentEditor siteId={site.id} />
            {!isNative && (
              <GeneratedFilesViewer environmentId={currentEnvironment.id} language={language} />
            )}
          </TabsContent>
        )}
        <TabsContent value="terminal" className="pt-4">
          <React.Suspense
            fallback={
              <Card className="h-[540px] animate-pulse bg-muted/30">
                <CardContent className="grid h-full place-items-center text-sm text-muted-foreground">
                  {text.loadingTerminal}
                </CardContent>
              </Card>
            }
          >
            <ContainerTerminal site={site} environment={environment} language={language} />
          </React.Suspense>
        </TabsContent>
        <TabsContent value="backups" className="pt-4">
          <div className="grid gap-4">
            <ProjectSnapshots site={site} language={language} />
            {!isNative && <DatabaseBackups environment={environment} language={language} />}
          </div>
        </TabsContent>
        <TabsContent value="tools" className="grid gap-4 pt-4">
          {!isNative && (
            <DeveloperToolsCard
              site={site}
              environment={environment}
              active={active}
              open={open}
              language={language}
            />
          )}
          {!isNative && (
            <QuickCommandsCard
              projectType={site.projectType}
              customCommand={customCommand}
              setCustomCommand={setCustomCommand}
              output={quickOutput}
              busy={busy}
              active={active}
              onRun={(command) => void runQuickCommand(command)}
              language={language}
            />
          )}
          {site.projectType === "wordpress" && (
            <WpCliCard
              environment={environment}
              siteName={site.name}
              active={active}
              language={language}
            />
          )}
          <SiteGitPanel
            status={git.status}
            details={git.details}
            newBranch={git.newBranch}
            setNewBranch={git.setNewBranch}
            commitMessage={git.commitMessage}
            setCommitMessage={git.setCommitMessage}
            gitAction={git.gitAction}
            initializeGit={git.initializeGit}
            checkoutBranch={git.checkoutBranch}
            busy={busy}
            onOpenRemote={() =>
              void invoke("open_site_git_remote", { siteId: currentSite.id }).catch((error) => {
                setMessage(errorMessage(error))
                setMessageOk(false)
              })
            }
            language={language}
          />
        </TabsContent>
      </Tabs>
      <Dialog open={phpInfo !== null} onOpenChange={(open) => !open && setPhpInfo(null)}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>phpinfo()</DialogTitle>
            <DialogDescription>{text.phpInfoDescription}</DialogDescription>
          </DialogHeader>
          <Textarea readOnly className="min-h-[60vh] font-mono text-xs" value={phpInfo ?? ""} />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => void navigator.clipboard.writeText(phpInfo ?? "")}
            >
              <Copy />
              {text.copy}
            </Button>
            <Button onClick={() => setPhpInfo(null)}>{text.close}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <EditProjectDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        name={editName}
        setName={setEditName}
        domain={editDomain}
        setDomain={setEditDomain}
        group={editGroup}
        setGroup={setEditGroup}
        tags={editTags}
        setTags={setEditTags}
        busy={busy}
        onSave={() =>
          void updateProject({
            name: editName,
            domain: editDomain,
            group: editGroup,
            tags: editTags.split(","),
          })
        }
        language={language}
      />
      <DuplicateProjectDialog
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
        name={duplicateName}
        setName={setDuplicateName}
        domain={duplicateDomain}
        setDomain={setDuplicateDomain}
        busy={busy}
        progress={duplicateProgress}
        onDuplicate={() => void duplicateProject()}
        language={language}
      />
      <DeleteSiteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        siteName={site.name}
        deleteFiles={deleteFiles}
        setDeleteFiles={setDeleteFiles}
        dirty={git.status?.dirty}
        changedFiles={git.status?.changedFiles ?? 0}
        busy={busy}
        onDelete={() => void remove()}
        language={language}
      />
      <CheckoutConflictDialog
        pendingCheckout={git.pendingCheckout}
        onOpenChange={(open) => !open && git.setPendingCheckout(null)}
        checkoutBranch={git.checkoutBranch}
        busy={busy}
        language={language}
      />
    </div>
  )
}

function EmptyPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid min-h-[70vh] place-items-center p-6">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
