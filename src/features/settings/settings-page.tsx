import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { open as openDialog } from "@tauri-apps/plugin-dialog"
import { Folder, Save } from "lucide-react"

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { AppSettings } from "@/welcome-screen"
import { applyTheme } from "@/theme"
import { DATABASE_VERSIONS, PHP_VERSIONS, defaultDatabaseVersion } from "@/lib/version-catalog"

export function SettingsPage({
  settings,
  onChange,
}: {
  settings: AppSettings
  onChange: (settings: AppSettings) => void
}) {
  const [draft, setDraft] = React.useState(settings)
  const [status, setStatus] = React.useState("")
  const text = pickLanguage(draft.language).settings
  async function chooseDirectory() {
    const path = await openDialog({
      directory: true,
      multiple: false,
      title: "Sites directory",
    })
    if (typeof path === "string") setDraft((current) => ({ ...current, sitesDirectory: path }))
  }
  async function chooseEditorExecutable() {
    const path = await openDialog({
      directory: false,
      multiple: false,
      title: text.customEditorCommandLabel,
    })
    if (typeof path === "string") setDraft((current) => ({ ...current, customEditorCommand: path }))
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
      <PageHeading title={text.settings} description={text.settingsDescription} />
      <div className="px-4 lg:px-6">
        <Tabs defaultValue="general" className="max-w-3xl">
          <TabsList>
            <TabsTrigger value="general">{text.tabGeneral}</TabsTrigger>
            <TabsTrigger value="system">{text.tabSystem}</TabsTrigger>
            <TabsTrigger value="appearance">{text.tabAppearance}</TabsTrigger>
            <TabsTrigger value="projects">{text.tabProjects}</TabsTrigger>
          </TabsList>
          <TabsContent value="general" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle>{text.tabGeneral}</CardTitle>
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
                <Separator />
                <SettingToggle
                  title={text.confirmDestructiveTitle}
                  description={text.confirmDestructiveDescription}
                  checked={draft.confirmDestructive}
                  onChange={(confirmDestructive) => setDraft({ ...draft, confirmDestructive })}
                />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="system" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle>{text.tabSystem}</CardTitle>
                <CardDescription>{text.systemCardDescription}</CardDescription>
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
                      <Button variant="outline" onClick={chooseEditorExecutable}>
                        <Folder />
                        {text.browseExecutable}
                      </Button>
                    </div>
                  </Field>
                )}
                <Separator />
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
          </TabsContent>
          <TabsContent value="appearance" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle>{text.tabAppearance}</CardTitle>
                <CardDescription>{text.appearanceCardDescription}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
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
          </TabsContent>
          <TabsContent value="projects" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle>{text.projectDefaultsTitle}</CardTitle>
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
          </TabsContent>
          <div className="flex items-center justify-between py-4">
            <span className="text-sm text-muted-foreground">{status}</span>
            <Button onClick={save}>
              <Save />
              {text.saveChanges}
            </Button>
          </div>
        </Tabs>
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
