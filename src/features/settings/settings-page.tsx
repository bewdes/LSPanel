import * as React from "react"
import { getVersion } from "@tauri-apps/api/app"
import { invoke } from "@tauri-apps/api/core"
import { open as openDialog } from "@tauri-apps/plugin-dialog"
import {
  BellRing,
  BookOpen,
  Container,
  ExternalLink,
  FolderCog,
  Folder,
  Gauge,
  GitBranch,
  Info,
  LayoutPanelLeft,
  Layers,
  Mail,
  Save,
  Server,
  SlidersHorizontal,
} from "lucide-react"

import { PageHeading } from "@/components/page-heading"
import { localeNames, locales, pickLanguage } from "@/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import type { AppSettings } from "@/welcome-screen"
import { applyTheme } from "@/theme"
import { DATABASE_VERSIONS, PHP_VERSIONS, defaultDatabaseVersion } from "@/lib/version-catalog"

type Section =
  | "general"
  | "workspace"
  | "docker"
  | "projects"
  | "monitoring"
  | "interface"
  | "performance"
  | "about"

export function SettingsPage({
  settings,
  onChange,
}: {
  settings: AppSettings
  onChange: (settings: AppSettings) => void
}) {
  const [draft, setDraft] = React.useState(settings)
  const [status, setStatus] = React.useState("")
  const [section, setSection] = React.useState<Section>("general")
  const [appVersion, setAppVersion] = React.useState("")
  const text = pickLanguage(draft.language).settings

  React.useEffect(() => {
    void getVersion().then(setAppVersion)
  }, [])

  const sections: { id: Section; label: string; icon: typeof SlidersHorizontal }[] = [
    { id: "general", label: text.navGeneral, icon: SlidersHorizontal },
    { id: "workspace", label: text.navWorkspace, icon: FolderCog },
    { id: "docker", label: text.navDocker, icon: Container },
    { id: "projects", label: text.navProjects, icon: Layers },
    { id: "monitoring", label: text.navMonitoring, icon: BellRing },
    { id: "interface", label: text.navInterface, icon: LayoutPanelLeft },
    { id: "performance", label: text.navPerformance, icon: Gauge },
    { id: "about", label: text.navAbout, icon: Info },
  ]

  async function chooseDirectory() {
    const path = await openDialog({
      directory: true,
      multiple: false,
      title: "Sites directory",
    })
    if (typeof path === "string") setDraft((current) => ({ ...current, sitesDirectory: path }))
  }
  async function chooseExecutable(title: string, apply: (path: string) => void) {
    const path = await openDialog({ directory: false, multiple: false, title })
    if (typeof path === "string") apply(path)
  }
  async function save() {
    try {
      const saved = await invoke<AppSettings>("save_settings", {
        settings: draft,
      })
      onChange(saved)
      applyTheme(saved.theme)
      setStatus(pickLanguage(saved.language).settings.settingsSaved)
    } catch (error) {
      setStatus(String(error))
    }
  }

  return (
    <div>
      <PageHeading
        title={text.settings}
        description={text.settingsDescription}
        action={
          <div className="flex items-center gap-3">
            {status && <span className="text-sm text-muted-foreground">{status}</span>}
            <Button onClick={() => void save()}>
              <Save />
              {text.saveChanges}
            </Button>
          </div>
        }
      />
      <div className="grid gap-6 px-4 lg:grid-cols-[220px_1fr] lg:px-6">
        <nav className="grid gap-1 self-start">
          {sections.map((item) => (
            <Button
              key={item.id}
              variant={section === item.id ? "secondary" : "ghost"}
              className="justify-start gap-2"
              onClick={() => setSection(item.id)}
            >
              <item.icon className="size-4" />
              {item.label}
            </Button>
          ))}
        </nav>
        <div className="grid gap-4">
          {section === "general" && (
            <Card>
              <CardHeader>
                <CardTitle>{text.navGeneral}</CardTitle>
                <CardDescription>{text.generalCardDescription}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
                <Field label={text.languageLabel}>
                  <Select
                    value={draft.language}
                    onValueChange={(value) =>
                      value && setDraft({ ...draft, language: String(value) })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {locales.map((code) => (
                        <SelectItem key={code} value={code}>
                          {localeNames[code]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={text.themeLabel}>
                  <Select
                    value={draft.theme}
                    onValueChange={(value) => value && setDraft({ ...draft, theme: String(value) })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dark">{text.darkOption}</SelectItem>
                      <SelectItem value="light">{text.lightOption}</SelectItem>
                      <SelectItem value="system">{text.systemOption}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Separator />
                <SettingToggle
                  title={text.confirmDestructiveTitle}
                  description={text.confirmDestructiveDescription}
                  checked={draft.confirmDestructive}
                  onChange={(confirmDestructive) => setDraft({ ...draft, confirmDestructive })}
                />
              </CardContent>
            </Card>
          )}

          {section === "workspace" && (
            <Card>
              <CardHeader>
                <CardTitle>{text.navWorkspace}</CardTitle>
                <CardDescription>{text.workspaceCardDescription}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
                <Field label={text.sitesDirectoryLabel}>
                  <div className="flex gap-2">
                    <Input readOnly value={draft.sitesDirectory} />
                    <Button variant="outline" onClick={chooseDirectory}>
                      <Folder />
                      {text.change}
                    </Button>
                  </div>
                </Field>
                <Separator />
                <Field label={text.editorLabel}>
                  <Select
                    value={draft.preferredEditor}
                    onValueChange={(value) =>
                      value && setDraft({ ...draft, preferredEditor: String(value) })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="code">{text.codeOption}</SelectItem>
                      <SelectItem value="phpstorm">{text.phpstormOption}</SelectItem>
                      <SelectItem value="cursor">{text.cursorOption}</SelectItem>
                      <SelectItem value="zed">{text.zedOption}</SelectItem>
                      <SelectItem value="sublime">{text.sublimeOption}</SelectItem>
                      <SelectItem value="custom">{text.customOption}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {draft.preferredEditor === "custom" && (
                  <Field label={text.customEditorCommandLabel}>
                    <div className="flex gap-2">
                      <Input
                        value={draft.customEditorCommand}
                        onChange={(event) =>
                          setDraft({ ...draft, customEditorCommand: event.target.value })
                        }
                      />
                      <Button
                        variant="outline"
                        onClick={() =>
                          void chooseExecutable(text.customEditorCommandLabel, (path) =>
                            setDraft((current) => ({ ...current, customEditorCommand: path })),
                          )
                        }
                      >
                        <Folder />
                        {text.browseExecutable}
                      </Button>
                    </div>
                  </Field>
                )}
                <Separator />
                <Field label={text.terminalLabel}>
                  <Select
                    value={draft.preferredTerminal}
                    onValueChange={(value) =>
                      value && setDraft({ ...draft, preferredTerminal: String(value) })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">{text.autoDetectOption}</SelectItem>
                      <SelectItem value="gnome-terminal">{text.gnomeTerminalOption}</SelectItem>
                      <SelectItem value="konsole">{text.konsoleOption}</SelectItem>
                      <SelectItem value="xfce4-terminal">{text.xfceTerminalOption}</SelectItem>
                      <SelectItem value="custom">{text.customOption}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {draft.preferredTerminal === "custom" && (
                  <Field label={text.customTerminalCommandLabel}>
                    <div className="flex gap-2">
                      <Input
                        value={draft.customTerminalCommand}
                        onChange={(event) =>
                          setDraft({ ...draft, customTerminalCommand: event.target.value })
                        }
                      />
                      <Button
                        variant="outline"
                        onClick={() =>
                          void chooseExecutable(text.customTerminalCommandLabel, (path) =>
                            setDraft((current) => ({ ...current, customTerminalCommand: path })),
                          )
                        }
                      >
                        <Folder />
                        {text.browseExecutable}
                      </Button>
                    </div>
                  </Field>
                )}
                <Separator />
                <Field label={text.browserLabel}>
                  <Select
                    value={draft.preferredBrowser}
                    onValueChange={(value) =>
                      value && setDraft({ ...draft, preferredBrowser: String(value) })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">{text.systemBrowserOption}</SelectItem>
                      <SelectItem value="firefox">{text.firefoxOption}</SelectItem>
                      <SelectItem value="chrome">{text.chromeOption}</SelectItem>
                      <SelectItem value="chromium">{text.chromiumOption}</SelectItem>
                      <SelectItem value="custom">{text.customOption}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {draft.preferredBrowser === "custom" && (
                  <Field label={text.customBrowserCommandLabel}>
                    <div className="flex gap-2">
                      <Input
                        value={draft.customBrowserCommand}
                        onChange={(event) =>
                          setDraft({ ...draft, customBrowserCommand: event.target.value })
                        }
                      />
                      <Button
                        variant="outline"
                        onClick={() =>
                          void chooseExecutable(text.customBrowserCommandLabel, (path) =>
                            setDraft((current) => ({ ...current, customBrowserCommand: path })),
                          )
                        }
                      >
                        <Folder />
                        {text.browseExecutable}
                      </Button>
                    </div>
                  </Field>
                )}
              </CardContent>
            </Card>
          )}

          {section === "docker" && (
            <Card>
              <CardHeader>
                <CardTitle>{text.navDocker}</CardTitle>
                <CardDescription>{text.dockerCardDescription}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
                <Field label={text.containerRuntimeLabel}>
                  <Select
                    value={draft.runtime}
                    onValueChange={(value) =>
                      value && setDraft({ ...draft, runtime: String(value) })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">{text.autoOption}</SelectItem>
                      <SelectItem value="docker">Docker</SelectItem>
                      <SelectItem value="podman">Podman</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Separator />
                <SettingToggle
                  title={text.dockerBuildkitTitle}
                  description={text.dockerBuildkitDescription}
                  checked={draft.dockerBuildkitEnabled}
                  onChange={(dockerBuildkitEnabled) =>
                    setDraft({ ...draft, dockerBuildkitEnabled })
                  }
                />
              </CardContent>
            </Card>
          )}

          {section === "projects" && (
            <Card>
              <CardHeader>
                <CardTitle>{text.navProjects}</CardTitle>
                <CardDescription>{text.projectDefaultsDescription}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={text.webServerLabel}>
                    <Select
                      value={draft.defaultWebServer}
                      onValueChange={(value) =>
                        value && setDraft({ ...draft, defaultWebServer: String(value) })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Nginx">Nginx</SelectItem>
                        <SelectItem value="Apache">Apache</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label={text.phpVersionLabel}>
                    <Select
                      value={draft.defaultPhpVersion}
                      onValueChange={(value) =>
                        value && setDraft({ ...draft, defaultPhpVersion: String(value) })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PHP_VERSIONS.map((version) => (
                          <SelectItem key={version} value={version}>
                            {version}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label={text.nodeVersionLabel}>
                    <Input
                      value={draft.defaultNodeVersion}
                      onChange={(event) =>
                        setDraft({ ...draft, defaultNodeVersion: event.target.value })
                      }
                    />
                  </Field>
                  <Field label={text.databaseLabel}>
                    <Select
                      value={draft.defaultDatabase}
                      onValueChange={(value) => {
                        if (!value) return
                        const database = String(value)
                        setDraft({
                          ...draft,
                          defaultDatabase: database,
                          defaultDatabaseVersion: defaultDatabaseVersion(database),
                        })
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["MariaDB", "MySQL", "PostgreSQL"].map((database) => (
                          <SelectItem key={database} value={database}>
                            {database}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label={text.databaseVersionLabel}>
                    <Select
                      value={draft.defaultDatabaseVersion}
                      onValueChange={(value) =>
                        value && setDraft({ ...draft, defaultDatabaseVersion: String(value) })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(DATABASE_VERSIONS[draft.defaultDatabase] ?? []).map((version) => (
                          <SelectItem key={version} value={version}>
                            {version}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Separator />
                <SettingToggle
                  title={text.initializeGitTitle}
                  description={text.initializeGitDescription}
                  checked={draft.autoInitGit}
                  onChange={(autoInitGit) => setDraft({ ...draft, autoInitGit })}
                />
                <SettingToggle
                  title={text.startNewProjectsTitle}
                  description={text.startNewProjectsDescription}
                  checked={draft.autoStartProjects}
                  onChange={(autoStartProjects) => setDraft({ ...draft, autoStartProjects })}
                />
              </CardContent>
            </Card>
          )}

          {section === "monitoring" && (
            <Card>
              <CardHeader>
                <CardTitle>{text.navMonitoring}</CardTitle>
                <CardDescription>{text.monitoringCardDescription}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
                <SettingToggle
                  title={text.notifyOnOperationsTitle}
                  description={text.notifyOnOperationsDescription}
                  checked={draft.notifyOnOperations}
                  onChange={(notifyOnOperations) => setDraft({ ...draft, notifyOnOperations })}
                />
                <SettingToggle
                  title={text.diskSpaceAlertTitle}
                  description={text.diskSpaceAlertDescription}
                  checked={draft.diskSpaceAlertEnabled}
                  onChange={(diskSpaceAlertEnabled) =>
                    setDraft({ ...draft, diskSpaceAlertEnabled })
                  }
                />
                {draft.diskSpaceAlertEnabled && (
                  <Field label={text.diskSpaceAlertThresholdLabel}>
                    <Input
                      type="number"
                      min={1}
                      max={1000}
                      value={draft.diskSpaceAlertThresholdGb}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          diskSpaceAlertThresholdGb: Number(event.target.value),
                        })
                      }
                    />
                  </Field>
                )}
                <SettingToggle
                  title={text.autoStopIdleTitle}
                  description={text.autoStopIdleDescription}
                  checked={draft.autoStopIdleEnabled}
                  onChange={(autoStopIdleEnabled) => setDraft({ ...draft, autoStopIdleEnabled })}
                />
                {draft.autoStopIdleEnabled && (
                  <Field label={text.autoStopIdleMinutesLabel}>
                    <Input
                      type="number"
                      min={5}
                      max={1440}
                      value={draft.autoStopIdleMinutes}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          autoStopIdleMinutes: Number(event.target.value),
                        })
                      }
                    />
                  </Field>
                )}
                <SettingToggle
                  title={text.autoHealTitle}
                  description={text.autoHealDescription}
                  checked={draft.autoHealEnabled}
                  onChange={(autoHealEnabled) => setDraft({ ...draft, autoHealEnabled })}
                />
                <SettingToggle
                  title={text.gitStatusNotifyTitle}
                  description={text.gitStatusNotifyDescription}
                  checked={draft.gitStatusNotifyEnabled}
                  onChange={(gitStatusNotifyEnabled) =>
                    setDraft({ ...draft, gitStatusNotifyEnabled })
                  }
                />
                {draft.gitStatusNotifyEnabled && (
                  <Field label={text.gitStatusBehindThresholdLabel}>
                    <Input
                      type="number"
                      min={1}
                      max={1000}
                      value={draft.gitStatusBehindThreshold}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          gitStatusBehindThreshold: Number(event.target.value),
                        })
                      }
                    />
                  </Field>
                )}
                <SettingToggle
                  title={text.tlsExpiryNotifyTitle}
                  description={text.tlsExpiryNotifyDescription}
                  checked={draft.tlsExpiryNotifyEnabled}
                  onChange={(tlsExpiryNotifyEnabled) =>
                    setDraft({ ...draft, tlsExpiryNotifyEnabled })
                  }
                />
                {draft.tlsExpiryNotifyEnabled && (
                  <Field label={text.tlsExpiryWarningDaysLabel}>
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      value={draft.tlsExpiryWarningDays}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          tlsExpiryWarningDays: Number(event.target.value),
                        })
                      }
                    />
                  </Field>
                )}
                <Separator />
                <Field label={text.webhookUrlLabel}>
                  <Input
                    type="url"
                    placeholder={text.webhookUrlPlaceholder}
                    value={draft.webhookUrl}
                    onChange={(event) => setDraft({ ...draft, webhookUrl: event.target.value })}
                  />
                </Field>
                <p className="text-xs text-muted-foreground">{text.webhookUrlHint}</p>
              </CardContent>
            </Card>
          )}

          {section === "interface" && (
            <Card>
              <CardHeader>
                <CardTitle>{text.navInterface}</CardTitle>
                <CardDescription>{text.interfaceCardDescription}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
                <SettingToggle
                  title={text.compactSidebarTitle}
                  description={text.compactSidebarDescription}
                  checked={draft.compactSidebar}
                  onChange={(compactSidebar) => setDraft({ ...draft, compactSidebar })}
                />
                <SettingToggle
                  title={text.reduceMotionTitle}
                  description={text.reduceMotionDescription}
                  checked={draft.reduceMotion}
                  onChange={(reduceMotion) => setDraft({ ...draft, reduceMotion })}
                />
              </CardContent>
            </Card>
          )}

          {section === "performance" && (
            <Card>
              <CardHeader>
                <CardTitle>{text.navPerformance}</CardTitle>
                <CardDescription>{text.performanceCardDescription}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
                <Field label={text.statsRefreshIntervalLabel}>
                  <Input
                    type="number"
                    min={3}
                    max={300}
                    value={draft.statsRefreshIntervalSeconds}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        statsRefreshIntervalSeconds: Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <p className="text-xs text-muted-foreground">{text.statsRefreshIntervalHint}</p>
              </CardContent>
            </Card>
          )}

          {section === "about" && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                    <Server className="size-5" />
                  </div>
                  <div>
                    <CardTitle>LS Panel</CardTitle>
                    {appVersion && (
                      <CardDescription>{text.aboutVersion(appVersion)}</CardDescription>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-5">
                <p className="text-sm text-muted-foreground">{text.aboutDescription}</p>
                <Separator />
                <div className="grid gap-2">
                  <Label>{text.aboutContactTitle}</Label>
                  <Button
                    variant="outline"
                    className="justify-start gap-2"
                    onClick={() => void invoke("open_url", { url: "https://github.com/bewdes" })}
                  >
                    <GitBranch className="size-4" />
                    <span className="flex-1 text-left">github.com/bewdes</span>
                    <ExternalLink className="size-4 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start gap-2"
                    onClick={() =>
                      void invoke("open_url", { url: "https://github.com/bewdes/LSPanel" })
                    }
                  >
                    <BookOpen className="size-4" />
                    <span className="flex-1 text-left">github.com/bewdes/LSPanel</span>
                    <ExternalLink className="size-4 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start gap-2"
                    onClick={() => {
                      window.location.href = "mailto:bewdes.studio@gmail.com"
                    }}
                  >
                    <Mail className="size-4" />
                    <span className="flex-1 text-left">bewdes.studio@gmail.com</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function SettingToggle({
  title,
  description,
  checked,
  onChange,
}: {
  title: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <Label>{title}</Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
