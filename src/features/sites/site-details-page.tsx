import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import {
  ArrowLeft,
  Archive,
  Code2,
  Copy,
  ExternalLink,
  Folder,
  GitBranch,
  History,
  KeyRound,
  Pin,
  Play,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Square,
  TerminalSquare,
  Trash2,
  Wrench,
} from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Credential } from "@/components/credential"
import { DatabaseConsole } from "@/features/database/components/database-console"
import { ProjectEnvironmentEditor } from "@/features/environment-files/components/project-environment-editor"
import { ProjectSnapshots } from "@/features/snapshots/components/project-snapshots"
import { DatabaseBackups } from "@/features/backups/components/database-backups"
import { pickLanguage } from "@/i18n"
import { siteDetailsText } from "@/i18n/site-details"
import { serviceHostname } from "@/lib/format"
import type { Environment, Site } from "@/types"
import type { GitDetails, GitStatus, HealthReport } from "@/features/sites/types"

const ContainerTerminal = React.lazy(() =>
  import("@/components/container-terminal").then((module) => ({
    default: module.ContainerTerminal,
  })),
)

export function SiteDetailsPage({
  uk,
  site,
  environment,
  state,
  onBack,
  onChanged,
  onOperated,
}: {
  uk: boolean
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
  const [gitStatus, setGitStatus] = React.useState<GitStatus | null>(null)
  const [gitDetails, setGitDetails] = React.useState<GitDetails | null>(null)
  const [newBranch, setNewBranch] = React.useState("")
  const [quickOutput, setQuickOutput] = React.useState("")
  const [customCommand, setCustomCommand] = React.useState("")
  const [wpCliCommand, setWpCliCommand] = React.useState("")
  const [wpCliBusy, setWpCliBusy] = React.useState(false)
  const [wpCliOutput, setWpCliOutput] = React.useState("")
  const [projectHealth, setProjectHealth] = React.useState<HealthReport | null>(null)
  const [phpInfo, setPhpInfo] = React.useState<string | null>(null)
  const [commitMessage, setCommitMessage] = React.useState("")
  const [editOpen, setEditOpen] = React.useState(false)
  const [editName, setEditName] = React.useState(site?.name ?? "")
  const [editDomain, setEditDomain] = React.useState(site?.domain ?? "")
  const [editGroup, setEditGroup] = React.useState(site?.group ?? "")
  const [editTags, setEditTags] = React.useState((site?.tags ?? []).join(", "))
  const [editAliases, setEditAliases] = React.useState((site?.aliases ?? []).join(", "))
  const [editDocumentRoot, setEditDocumentRoot] = React.useState(
    site?.documentRoot ?? "public_html",
  )
  const [duplicateOpen, setDuplicateOpen] = React.useState(false)
  const [duplicateName, setDuplicateName] = React.useState("")
  const [duplicateDomain, setDuplicateDomain] = React.useState("")
  const text = pickLanguage(siteDetailsText, uk)
  React.useEffect(() => {
    setEditName(site?.name ?? "")
    setEditDomain(site?.domain ?? "")
    setEditGroup(site?.group ?? "")
    setEditTags((site?.tags ?? []).join(", "))
    setEditAliases((site?.aliases ?? []).join(", "))
    setEditDocumentRoot(site?.documentRoot ?? "public_html")
  }, [
    site?.id,
    site?.name,
    site?.domain,
    site?.group,
    site?.tags,
    site?.aliases,
    site?.documentRoot,
  ])
  React.useEffect(() => {
    if (site?.directory)
      void Promise.all([
        invoke<GitStatus>("site_git_status", { directory: site.directory }),
        invoke<GitDetails>("site_git_details", { directory: site.directory }).catch(() => null),
      ])
        .then(([status, details]) => {
          setGitStatus(status)
          setGitDetails(details)
        })
        .catch(() => {
          setGitStatus(null)
          setGitDetails(null)
        })
  }, [site?.directory])
  if (!site || !environment)
    return <EmptyPage title={text.notFoundTitle} description={text.notFoundDescription} />
  const currentSite = site
  const currentEnvironment = environment
  const isNative = currentEnvironment.runtimeMode === "native"
  const siteUrl = isNative
    ? `http://127.0.0.1:${currentEnvironment.port}`
    : `https://${site.domain}`
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
  async function updateProject(values: {
    name?: string
    domain?: string
    pinned?: boolean
    archived?: boolean
    group?: string
    tags?: string[]
    aliases?: string[]
    documentRoot?: string
  }) {
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
        documentRoot: values.documentRoot ?? currentSite.documentRoot ?? "public_html",
      })
      setEditOpen(false)
      await onChanged()
    } catch (error) {
      setMessage(errorMessage(error))
      setMessageOk(false)
      setBusy(false)
    }
  }
  async function duplicateProject() {
    setBusy(true)
    setMessage("")
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
    }
  }
  async function refreshGit() {
    const [status, details] = await Promise.all([
      invoke<GitStatus>("site_git_status", { directory: currentSite.directory }),
      invoke<GitDetails>("site_git_details", { directory: currentSite.directory }),
    ])
    setGitStatus(status)
    setGitDetails(details)
  }
  async function gitAction(action: "fetch" | "pull" | "commit" | "push") {
    setBusy(true)
    setMessage("")
    try {
      await invoke<GitStatus>("site_git_action", {
        directory: currentSite.directory,
        action,
        message: commitMessage,
      })
      if (action === "commit") setCommitMessage("")
      await refreshGit()
      setMessage(text.gitCompletedMessage(action))
      setMessageOk(true)
    } catch (error) {
      setMessage(errorMessage(error))
      setMessageOk(false)
    } finally {
      setBusy(false)
    }
  }
  async function initializeGit() {
    setBusy(true)
    setMessage("")
    try {
      await invoke<GitStatus>("initialize_site_git", { siteId: currentSite.id })
      await refreshGit()
      setMessage(text.gitInitSuccessMessage)
      setMessageOk(true)
    } catch (error) {
      setMessage(errorMessage(error))
      setMessageOk(false)
    } finally {
      setBusy(false)
    }
  }
  async function checkoutBranch(branch: string, create = false) {
    if (!branch) return
    setBusy(true)
    setMessage("")
    try {
      await invoke<GitStatus>("site_git_checkout", {
        directory: currentSite.directory,
        branch,
        create,
      })
      setNewBranch("")
      await refreshGit()
      setMessage(create ? text.createdAndSwitchedTo(branch) : text.switchedTo(branch))
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
  async function runWpCli(command: string) {
    const trimmed = command.trim()
    if (!trimmed) return
    setWpCliBusy(true)
    setWpCliOutput("")
    try {
      const service = currentEnvironment.webServer === "Nginx" ? "php" : "web"
      await invoke<string>("execute_environment_service_command", {
        id: currentEnvironment.id,
        service,
        command: [
          "php",
          "-r",
          "$d=file_get_contents('https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar'); if($d===false){exit(2);} file_put_contents('/tmp/lspanel-wpcli.phar',$d);",
        ],
      })
      const args = splitCommandLine(trimmed)
      const output = await invoke<string>("execute_environment_service_command", {
        id: currentEnvironment.id,
        service,
        command: [
          "php",
          "/tmp/lspanel-wpcli.phar",
          ...args,
          "--allow-root",
          `--path=/var/www/sites/${currentSite.name}`,
        ],
      })
      setWpCliOutput(`$ wp ${trimmed}\n${output}`)
    } catch (error) {
      setWpCliOutput(`$ wp ${trimmed}\n${errorMessage(error)}`)
    } finally {
      setWpCliBusy(false)
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
          <p className="text-sm text-muted-foreground">
            {isNative ? `127.0.0.1:${currentEnvironment.port}` : site.domain}
          </p>
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
          onClick={() => open("open_editor", { path: site.directory })}
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
          onClick={() => void updateProject({ pinned: !site.pinned })}
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
          onClick={() => void updateProject({ archived: !site.archived })}
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
          <TabsTrigger value="terminal">{text.tabTerminal}</TabsTrigger>
          <TabsTrigger value="backups">{text.tabBackups}</TabsTrigger>
          <TabsTrigger value="tools">{text.tabTools}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="grid gap-4 pt-4 md:grid-cols-2">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">{text.projectServices}</CardTitle>
              <CardDescription>{text.projectServicesDescription}</CardDescription>
            </CardHeader>
            <CardContent className="grid divide-y text-sm">
              <div className="flex items-center justify-between py-1.5 first:pt-0">
                <span className="text-muted-foreground">{text.domain}</span>
                <span className="font-medium">
                  {isNative ? `127.0.0.1:${currentEnvironment.port}` : site.domain}
                </span>
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
                      {environment.webServer} {environment.webVersion}
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
                          onClick={() => void loadPhpInfo()}
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
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{text.domainAliases}</CardTitle>
              <CardDescription>{text.domainAliasesDescription}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Input
                value={editAliases}
                onChange={(event) => setEditAliases(event.target.value.toLowerCase())}
                placeholder="api.demo.localhost, *.demo.localhost"
              />
              <p className="text-xs text-muted-foreground">{text.aliasesHint}</p>
            </CardContent>
            <CardFooter>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void updateProject({ aliases: editAliases.split(",") })}
              >
                <Save />
                {text.saveAliases}
              </Button>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader className="flex-row items-center">
              <div>
                <CardTitle className="text-base">{text.projectHealth}</CardTitle>
                <CardDescription>{text.projectHealthDescription}</CardDescription>
              </div>
              <Button
                className="ml-auto"
                variant="outline"
                disabled={busy || !active}
                onClick={() => void checkProjectHealth()}
              >
                <RefreshCw className={busy ? "animate-spin" : ""} />
                {text.runChecks}
              </Button>
            </CardHeader>
            {projectHealth && (
              <CardContent className="grid gap-2 sm:grid-cols-2">
                {projectHealth.checks.map((item) => (
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
        </TabsContent>
        {!isNative && (
          <TabsContent value="database" className="grid gap-4 pt-4">
            <Card>
              <CardHeader>
                <CardTitle>{environment.database}</CardTitle>
                <CardDescription>{environment.databaseName ?? "app"}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <Credential label={text.host} value="database" />
                <Credential label={text.user} value={environment.databaseUser ?? "app"} />
                <Credential
                  label={text.password}
                  value={environment.databasePassword ?? ""}
                  secret
                />
                {site.projectType === "wordpress" && (
                  <>
                    <Credential
                      label={text.wordpressAdmin}
                      value={environment.wordpressAdminUser ?? "admin"}
                    />
                    <Credential
                      label={text.wordpressPassword}
                      value={environment.wordpressAdminPassword ?? ""}
                      secret
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
            <DatabaseConsole environment={environment} />
          </TabsContent>
        )}
        {!(isNative && site.projectType === "static") && (
          <TabsContent value="environment" className="pt-4">
            <ProjectEnvironmentEditor siteId={site.id} />
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
            <ContainerTerminal site={site} environment={environment} />
          </React.Suspense>
        </TabsContent>
        <TabsContent value="backups" className="pt-4">
          <div className="grid gap-4">
            <ProjectSnapshots site={site} uk={uk} />
            {!isNative && <DatabaseBackups environment={environment} uk={uk} />}
          </div>
        </TabsContent>
        <TabsContent value="tools" className="grid gap-4 pt-4">
          {!isNative && (
            <Card>
              <CardHeader>
                <CardTitle>{text.developerTools}</CardTitle>
                <CardDescription>{text.projectActions}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={!active}
                  onClick={() => open("repair_site_permissions", { id: site.id })}
                >
                  <Wrench />
                  {text.repairPermissions}
                </Button>
                {environment.extraServices?.includes("mailpit") && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      open("open_url", {
                        url: `https://${serviceHostname("mailpit", environment.name)}`,
                      })
                    }
                  >
                    Mailpit <ExternalLink />
                  </Button>
                )}
                {site.projectType === "laravel" && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => open("open_url", { url: `https://${site.domain}/telescope` })}
                    >
                      Telescope <ExternalLink />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        open("open_editor", {
                          path: `${site.directory}/storage/logs/laravel.log`,
                        })
                      }
                    >
                      <Code2 />
                      {text.laravelLog}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}
          {!isNative && (
            <Card>
              <CardHeader>
                <CardTitle>{text.quickCommands}</CardTitle>
                <CardDescription>{text.quickCommandsDescription}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="flex flex-wrap gap-2">
                  {projectQuickCommands(site.projectType).map((command) => (
                    <Button
                      key={command}
                      variant="outline"
                      disabled={busy || !active}
                      onClick={() => void runQuickCommand(command)}
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
                    placeholder={site.projectType === "node" ? "npm run build" : "php -v"}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && customCommand.trim())
                        void runQuickCommand(customCommand)
                    }}
                  />
                  <Button
                    disabled={busy || !active || !customCommand.trim()}
                    onClick={() => void runQuickCommand(customCommand)}
                  >
                    <TerminalSquare />
                    {text.run}
                  </Button>
                </div>
                {!active && (
                  <p className="text-xs text-muted-foreground">
                    {text.startEnvironmentToRunCommands}
                  </p>
                )}
                {quickOutput && (
                  <Textarea readOnly className="min-h-40 font-mono text-xs" value={quickOutput} />
                )}
              </CardContent>
            </Card>
          )}
          {site.projectType === "wordpress" && (
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
                {!active && (
                  <p className="text-xs text-muted-foreground">{text.wpCliStartRequired}</p>
                )}
                {wpCliOutput && (
                  <Textarea readOnly className="min-h-40 font-mono text-xs" value={wpCliOutput} />
                )}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Git</CardTitle>
              <CardDescription>
                {gitStatus?.repository
                  ? `${gitStatus.branch} · ${gitStatus.dirty ? text.changedFiles(gitStatus.changedFiles) : text.workingTreeClean}`
                  : text.gitNotInitializedDescription}
              </CardDescription>
            </CardHeader>
            {gitStatus && !gitStatus.repository && (
              <CardContent>
                <Button disabled={busy} onClick={() => void initializeGit()}>
                  <GitBranch />
                  {text.initializeGit}
                </Button>
              </CardContent>
            )}
            {gitStatus?.repository && (
              <CardContent className="grid gap-3">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={busy} onClick={() => void gitAction("fetch")}>
                    <RefreshCw />
                    {text.fetch}
                  </Button>
                  <Button variant="outline" disabled={busy} onClick={() => void gitAction("pull")}>
                    <RefreshCw />
                    {text.pull}
                  </Button>
                  <Button variant="outline" disabled={busy} onClick={() => void gitAction("push")}>
                    <ExternalLink />
                    {text.push}
                  </Button>
                  {gitDetails?.remoteUrl && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      title={gitDetails.remoteUrl}
                      onClick={() =>
                        void invoke("open_site_git_remote", { siteId: currentSite.id }).catch(
                          (error) => {
                            setMessage(errorMessage(error))
                            setMessageOk(false)
                          },
                        )
                      }
                    >
                      <ExternalLink />
                      {text.openRepository}
                    </Button>
                  )}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={commitMessage}
                    onChange={(event) => setCommitMessage(event.target.value)}
                    placeholder={text.commitMessagePlaceholder}
                  />
                  <Button
                    disabled={busy || !gitStatus.dirty || !commitMessage.trim()}
                    onClick={() => void gitAction("commit")}
                  >
                    <Save />
                    {text.commitAllChanges}
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
          {gitStatus?.repository && (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GitBranch />
                    {text.branches}
                  </CardTitle>
                  <CardDescription>{text.branchesDescription}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <Select
                    value={gitStatus.branch}
                    onValueChange={(value) => {
                      if (value && value !== gitStatus.branch) void checkoutBranch(String(value))
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={text.selectBranch} />
                    </SelectTrigger>
                    <SelectContent>
                      {gitDetails?.branches.map((branch) => (
                        <SelectItem key={branch} value={branch}>
                          {branch}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Input
                      value={newBranch}
                      onChange={(event) => setNewBranch(event.target.value)}
                      placeholder="feature/new-branch"
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void checkoutBranch(newBranch, true)
                      }}
                    />
                    <Button
                      disabled={busy || !newBranch.trim()}
                      onClick={() => void checkoutBranch(newBranch, true)}
                    >
                      <Plus />
                      {text.create}
                    </Button>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <History />
                    {text.recentCommits}
                  </CardTitle>
                  <CardDescription>{text.recentCommitsDescription}</CardDescription>
                </CardHeader>
                <CardContent className="grid max-h-72 gap-1 overflow-auto">
                  {gitDetails?.commits.length ? (
                    gitDetails.commits.map((commit) => (
                      <div
                        key={commit.hash}
                        className="grid grid-cols-[auto_1fr] gap-x-3 border-b py-2 text-sm last:border-0"
                      >
                        <code className="text-xs text-muted-foreground">{commit.hash}</code>
                        <span className="truncate font-medium">{commit.subject}</span>
                        <span />
                        <span className="text-xs text-muted-foreground">
                          {commit.author} · {commit.relativeDate}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">{text.noCommitsYet}</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{text.changedFilesTitle}</CardTitle>
                  <CardDescription>{text.changedFilesDescription}</CardDescription>
                </CardHeader>
                <CardContent className="grid max-h-72 gap-1 overflow-auto">
                  {gitDetails?.changes.length ? (
                    gitDetails.changes.map((change) => (
                      <div
                        key={`${change.status}-${change.path}`}
                        className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2 border-b py-2 text-sm last:border-0"
                      >
                        <Badge variant="outline" className="justify-center font-mono">
                          {change.status || "M"}
                        </Badge>
                        <span className="truncate font-mono text-xs">{change.path}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {text.workingTreeCleanParagraph}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
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
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{text.projectSettings}</DialogTitle>
            <DialogDescription>{text.projectSettingsDescription}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>{text.name}</Label>
              <Input value={editName} onChange={(event) => setEditName(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>{text.localDomain}</Label>
              <Input
                value={editDomain}
                onChange={(event) => setEditDomain(event.target.value.toLowerCase())}
              />
            </div>
            <div className="grid gap-2">
              <Label>{text.group}</Label>
              <Input
                value={editGroup}
                maxLength={48}
                onChange={(event) => setEditGroup(event.target.value)}
                placeholder={text.groupPlaceholder}
              />
            </div>
            <div className="grid gap-2">
              <Label>{text.tags}</Label>
              <Input
                value={editTags}
                onChange={(event) => setEditTags(event.target.value)}
                placeholder={text.tagsPlaceholder}
              />
              <p className="text-xs text-muted-foreground">{text.tagsHint}</p>
            </div>
            <div className="grid gap-2">
              <Label>{text.documentRoot}</Label>
              <Select
                value={editDocumentRoot}
                disabled={["laravel", "symfony"].includes(currentSite.projectType ?? "")}
                onValueChange={(value) => value && setEditDocumentRoot(String(value))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="project">{text.documentRootProject}</SelectItem>
                  <SelectItem value="public_html">{text.documentRootPublicHtml}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {["laravel", "symfony"].includes(currentSite.projectType ?? "")
                  ? text.documentRootFrameworkHint
                  : text.documentRootHint}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setEditOpen(false)}>
              {text.cancel}
            </Button>
            <Button
              disabled={busy || !editName || !editDomain}
              onClick={() =>
                void updateProject({
                  name: editName,
                  documentRoot: editDocumentRoot,
                  domain: editDomain,
                  group: editGroup,
                  tags: editTags.split(","),
                })
              }
            >
              {busy ? text.saving : text.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{text.duplicateProject}</DialogTitle>
            <DialogDescription>{text.duplicateProjectDescription}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>{text.newName}</Label>
              <Input
                value={duplicateName}
                onChange={(event) => {
                  setDuplicateName(event.target.value)
                  setDuplicateDomain(
                    `${event.target.value.toLowerCase().replace(/_/g, "-")}.localhost`,
                  )
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label>{text.newDomain}</Label>
              <Input
                value={duplicateDomain}
                onChange={(event) => setDuplicateDomain(event.target.value.toLowerCase())}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setDuplicateOpen(false)}>
              {text.cancel}
            </Button>
            <Button
              disabled={busy || !duplicateName || !duplicateDomain}
              onClick={() => void duplicateProject()}
            >
              {busy ? text.duplicating : text.duplicate}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{text.deleteSiteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{text.deleteSiteDescription(site.name)}</AlertDialogDescription>
            {gitStatus?.dirty && (
              <Alert variant="destructive">
                <AlertDescription>{text.gitDirtyWarning(gitStatus.changedFiles)}</AlertDescription>
              </Alert>
            )}
            <label className="flex items-center gap-3 rounded-lg border p-3 text-sm">
              <Checkbox
                checked={deleteFiles}
                onCheckedChange={(value) => setDeleteFiles(Boolean(value))}
              />
              <span>{text.deleteFilesLabel}</span>
            </label>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{text.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(event) => {
                event.preventDefault()
                void remove()
              }}
            >
              {text.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

function projectQuickCommands(projectType?: string) {
  if (projectType === "node" || projectType === "react")
    return ["npm install", "npm run build", "npm start"]
  if (projectType === "laravel")
    return [
      "composer install",
      "php artisan migrate",
      "php artisan cache:clear",
      "php artisan config:clear",
      "php artisan queue:work --once",
    ]
  if (projectType === "symfony")
    return [
      "composer install",
      "php bin/console cache:clear",
      "php bin/console doctrine:migrations:migrate --no-interaction",
    ]
  if (projectType === "wordpress") return ["php -v", "composer install", "php -m"]
  return ["php -v", "php -m", "composer install"]
}

function splitCommandLine(value: string) {
  const result: string[] = []
  let current = ""
  let quote = ""
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (quote) {
      if (character === quote) quote = ""
      else if (character === "\\" && index + 1 < value.length) current += value[++index]
      else current += character
    } else if (character === '"' || character === "'") quote = character
    else if (/\s/.test(character)) {
      if (current) {
        result.push(current)
        current = ""
      }
    } else current += character
  }
  if (quote) throw new Error("Command contains an unclosed quote")
  if (current) result.push(current)
  if (!result.length) throw new Error("Enter a command")
  return result
}
