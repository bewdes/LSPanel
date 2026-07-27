import React from "react"
import { open } from "@tauri-apps/plugin-dialog"
import { invoke } from "@tauri-apps/api/core"
import { Check, FolderOpen, Globe2, Moon, Server } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { applyTheme } from "@/theme"
import { homeDir, join } from "@tauri-apps/api/path"

export type AppSettings = {
  completed: boolean
  language: string
  sitesDirectory: string
  theme: string
  runtime: string
  compactSidebar: boolean
  reduceMotion: boolean
  confirmDestructive: boolean
  defaultWebServer: string
  defaultPhpVersion: string
  defaultNodeVersion: string
  defaultDatabase: string
  defaultDatabaseVersion: string
  autoInitGit: boolean
  autoStartProjects: boolean
}
const onboarding = {
  uk: {
    welcome: "Ласкаво просимо до LS Panel",
    title: "Налаштуймо робочий простір",
    text: "Три налаштування перед створенням першого локального сайту.",
    titleCard: "Налаштування",
    language: "Мова інтерфейсу",
    languageHint: "Можна змінити пізніше в налаштуваннях.",
    directory: "Директорія сайтів",
    directoryHint: "Тут зберігатимуться вихідні файли нових проєктів.",
    choose: "Вибрати директорію",
    theme: "Тема",
    themeHint: "Оформлення панелі та додаткових вікон.",
    dark: "Темна",
    light: "Світла",
    system: "Системна",
    next: "Продовжити",
  },
  en: {
    welcome: "Welcome to LS Panel",
    title: "Set up your workspace",
    text: "Three settings before creating your first local site.",
    titleCard: "Settings",
    language: "Interface language",
    languageHint: "You can change it later in Settings.",
    directory: "Sites directory",
    directoryHint: "Source files for new projects will be stored here.",
    choose: "Choose directory",
    theme: "Theme",
    themeHint: "Appearance of the panel and additional windows.",
    dark: "Dark",
    light: "Light",
    system: "System",
    next: "Continue",
  },
} as const

export function WelcomeScreen({ onComplete }: { onComplete: (settings: AppSettings) => void }) {
  const [settings, setSettings] = React.useState<AppSettings>({
    completed: true,
    language: "uk",
    sitesDirectory: "",
    theme: "dark",
    runtime: "auto",
    compactSidebar: false,
    reduceMotion: false,
    confirmDestructive: true,
    defaultWebServer: "Nginx",
    defaultPhpVersion: "8.4",
    defaultNodeVersion: "22",
    defaultDatabase: "MariaDB",
    defaultDatabaseVersion: "11.8",
    autoInitGit: true,
    autoStartProjects: true,
  })
  const [error, setError] = React.useState("")
  const copy =
    onboarding[
      (settings.language in onboarding ? settings.language : "en") as keyof typeof onboarding
    ]
  React.useEffect(() => {
    applyTheme(settings.theme)
  }, [settings.theme])
  React.useEffect(() => {
    void homeDir()
      .then((home) => join(home, "LSP Sites"))
      .then((sitesDirectory) =>
        setSettings((current) =>
          current.sitesDirectory ? current : { ...current, sitesDirectory },
        ),
      )
      .catch(() => {})
  }, [])
  async function chooseDirectory() {
    const selected = await open({ directory: true, multiple: false, title: copy.choose })
    if (typeof selected === "string") setSettings({ ...settings, sitesDirectory: selected })
  }
  async function finish() {
    try {
      setError("")
      onComplete(await invoke<AppSettings>("save_settings", { settings }))
    } catch (value) {
      setError(String(value))
    }
  }
  return (
    <main className="flex h-full min-h-0 w-full overflow-y-auto bg-background p-4 text-foreground sm:p-6">
      <div className="m-auto flex w-full max-w-2xl flex-col gap-5 py-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl border bg-card shadow-sm">
            <Server className="size-5" />
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium tracking-[.22em] text-muted-foreground uppercase">
              {copy.welcome}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{copy.title}</h1>
            <p className="text-sm text-muted-foreground">{copy.text}</p>
          </div>
        </div>

        <Card className="gap-0 py-0 shadow-sm">
          <CardHeader className="border-b py-4">
            <CardTitle>{copy.titleCard}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y px-0">
            <OnboardingRow icon={Globe2} title={copy.language} description={copy.languageHint}>
              <GlassSelect
                value={settings.language}
                onChange={(language) => setSettings({ ...settings, language })}
                label={copy.language}
                options={[
                  ["uk", "Українська"],
                  ["en", "English"],
                ]}
              />
            </OnboardingRow>
            <OnboardingRow
              icon={FolderOpen}
              title={copy.directory}
              description={copy.directoryHint}
            >
              <Button
                variant="outline"
                className="w-full min-w-0 justify-start"
                onClick={chooseDirectory}
              >
                <FolderOpen />
                <span className="truncate">{settings.sitesDirectory || copy.choose}</span>
              </Button>
            </OnboardingRow>
            <OnboardingRow icon={Moon} title={copy.theme} description={copy.themeHint}>
              <GlassSelect
                value={settings.theme}
                onChange={(theme) => setSettings({ ...settings, theme })}
                label={copy.theme}
                options={[
                  ["dark", copy.dark],
                  ["light", copy.light],
                  ["system", copy.system],
                ]}
              />
            </OnboardingRow>
          </CardContent>
          <CardFooter className="justify-end gap-3 py-4">
            <Button size="lg" onClick={finish} disabled={!settings.sitesDirectory}>
              {copy.next}
              <Check />
            </Button>
          </CardFooter>
        </Card>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </main>
  )
}

function OnboardingRow({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Globe2
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-3 px-4 py-4 sm:grid-cols-[36px_minmax(0,1fr)_220px] sm:items-center">
      <div className="flex size-9 items-center justify-center rounded-lg border bg-muted/50">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0 sm:col-start-3">{children}</div>
    </div>
  )
}

export function GlassSelect({
  value,
  options,
  onChange,
  label,
}: {
  value: string
  options: string[][]
  onChange: (value: string) => void
  label: string
}) {
  return (
    <Select value={value} onValueChange={(nextValue) => nextValue && onChange(String(nextValue))}>
      <SelectTrigger aria-label={label} className="w-full">
        <SelectValue>{options.find(([option]) => option === value)?.[1]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map(([option, optionLabel]) => (
          <SelectItem key={option} value={option}>
            {optionLabel}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
