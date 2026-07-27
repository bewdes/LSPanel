import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog"
import {
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  FolderSync,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Upload,
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
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import type { EnvironmentEntry, EnvironmentFile } from "@/features/environment-files/types"

export function ProjectEnvironmentEditor({ siteId }: { siteId: string }) {
  const [file, setFile] = React.useState<EnvironmentFile | null>(null)
  const [example, setExample] = React.useState<EnvironmentFile | null>(null)
  const [entries, setEntries] = React.useState<EnvironmentEntry[]>([])
  const [text, setText] = React.useState("")
  const [mode, setMode] = React.useState("table")
  const [search, setSearch] = React.useState("")
  const [visible, setVisible] = React.useState<Record<number, boolean>>({})
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState("")
  const [copied, setCopied] = React.useState<number | null>(null)
  const [importPath, setImportPath] = React.useState("")
  const [profiles, setProfiles] = React.useState<string[]>([])
  const [profile, setProfile] = React.useState("local")
  const [customProfile, setCustomProfile] = React.useState("")
  const [deleteProfile, setDeleteProfile] = React.useState("")

  React.useEffect(() => {
    Promise.all([
      invoke<EnvironmentFile>("read_site_environment", { siteId }),
      invoke<EnvironmentFile>("read_site_environment_example", { siteId }),
      invoke<string[]>("list_site_environment_profiles", { siteId }),
    ])
      .then(([next, nextExample, nextProfiles]) => {
        setFile(next)
        setExample(nextExample)
        setEntries(next.entries)
        setText(next.text)
        setProfiles(nextProfiles)
      })
      .catch((error) => setMessage(String(error)))
  }, [siteId])

  const serialize = React.useCallback(
    (items: EnvironmentEntry[]) =>
      items
        .filter((entry) => entry.key.trim())
        .map((entry) => `${entry.key.trim()}=${entry.value}`)
        .join("\n") + (items.length ? "\n" : ""),
    [],
  )
  const setEntry = (index: number, patch: Partial<EnvironmentEntry>) =>
    setEntries((current) =>
      current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)),
    )
  const changeMode = (next: string) => {
    if (next === "text") setText(serialize(entries))
    setMode(next)
  }
  const save = async () => {
    setBusy(true)
    setMessage("")
    try {
      const next = await invoke<EnvironmentFile>("write_site_environment", {
        siteId,
        text: mode === "text" ? text : serialize(entries),
      })
      setFile(next)
      setEntries(next.entries)
      setText(next.text)
      setMessage("Environment saved. Restart the application service to reload runtime variables.")
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }
  const generate = async (index: number) => {
    try {
      setEntry(index, {
        value: await invoke<string>("generate_environment_secret", {
          length: 48,
        }),
        secret: true,
      })
    } catch (error) {
      setMessage(String(error))
    }
  }
  const filtered = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.key.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.entry.key.localeCompare(b.entry.key))
  const missing = (example?.entries ?? []).filter(
    (candidate) => !entries.some((entry) => entry.key === candidate.key),
  )
  const addMissing = () => {
    setEntries((current) => [...current, ...missing.map((entry) => ({ ...entry }))])
    setMessage(
      `${missing.length} missing variable(s) added from .env.example. Save to apply changes.`,
    )
  }
  const chooseImport = async () => {
    const path = await openDialog({
      title: "Import project environment",
      multiple: false,
      directory: false,
    })
    if (path) setImportPath(path)
  }
  const importEnvironment = async () => {
    if (!importPath) return
    setBusy(true)
    setMessage("")
    try {
      const next = await invoke<EnvironmentFile>("import_site_environment", {
        siteId,
        path: importPath,
      })
      setFile(next)
      setEntries(next.entries)
      setText(next.text)
      setImportPath("")
      setMessage("Environment imported successfully. Restart services to apply it.")
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }
  const exportEnvironment = async () => {
    const path = await saveDialog({ title: "Export project environment", defaultPath: ".env" })
    if (!path) return
    setBusy(true)
    setMessage("")
    try {
      await invoke("export_site_environment", { siteId, path })
      setMessage("Environment exported successfully.")
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }
  const selectedProfile = customProfile.trim().toLowerCase() || profile
  const profileExists = profiles.includes(selectedProfile)
  const profileOptions = Array.from(
    new Set(["local", "testing", "development", ...profiles]),
  ).sort()
  const refreshProfiles = async () => {
    setProfiles(await invoke<string[]>("list_site_environment_profiles", { siteId }))
  }
  const saveProfile = async () => {
    setBusy(true)
    setMessage("")
    try {
      await invoke("save_site_environment_profile", {
        siteId,
        profile: selectedProfile,
        text: mode === "text" ? text : serialize(entries),
      })
      await refreshProfiles()
      setProfile(selectedProfile)
      setCustomProfile("")
      setMessage(`Environment profile "${selectedProfile}" saved successfully.`)
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }
  const activateProfile = async () => {
    setBusy(true)
    setMessage("")
    try {
      const next = await invoke<EnvironmentFile>("activate_site_environment_profile", {
        siteId,
        profile: selectedProfile,
      })
      setFile(next)
      setEntries(next.entries)
      setText(next.text)
      setMessage(
        `Environment profile "${selectedProfile}" applied successfully. Restart services to reload it.`,
      )
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }
  const removeProfile = async () => {
    setBusy(true)
    setMessage("")
    try {
      await invoke("delete_site_environment_profile", { siteId, profile: deleteProfile })
      await refreshProfiles()
      setDeleteProfile("")
      setMessage("Environment profile deleted successfully.")
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Project environment</CardTitle>
        <CardDescription>
          {file?.path ?? "Loading .env…"}. This file is available inside the mounted project
          directory. Secrets never leave the local machine.
        </CardDescription>
        <CardAction>
          <Badge variant={file?.exists ? "outline" : "secondary"}>
            {file?.exists ? ".env" : "New file"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Environment profiles</p>
            <p className="text-xs text-muted-foreground">
              Save the current editor state or apply a stored profile to the active .env.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={profile}
              onValueChange={(value) => {
                if (!value) return
                setProfile(value)
                setCustomProfile("")
              }}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {profileOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="w-52"
              placeholder="Custom profile name"
              value={customProfile}
              maxLength={48}
              onChange={(event) =>
                setCustomProfile(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
              }
            />
            <Button
              variant="outline"
              disabled={busy || !selectedProfile}
              onClick={() => void saveProfile()}
            >
              <Save /> Save profile
            </Button>
            <Button
              variant="outline"
              disabled={busy || !profileExists}
              onClick={() => void activateProfile()}
            >
              <FolderSync /> Apply
            </Button>
            <Button
              variant="ghost"
              disabled={busy || !profileExists}
              onClick={() => setDeleteProfile(selectedProfile)}
            >
              <Trash2 /> Delete
            </Button>
          </div>
        </div>
        <Tabs value={mode} onValueChange={(value) => value && changeMode(String(value))}>
          <div className="flex flex-wrap items-center gap-2">
            <TabsList>
              <TabsTrigger value="table">Table</TabsTrigger>
              <TabsTrigger value="text">Text</TabsTrigger>
            </TabsList>
            {example?.exists && (
              <Button variant="outline" disabled={!missing.length} onClick={addMissing}>
                <Plus />
                Add missing from example{missing.length ? ` (${missing.length})` : ""}
              </Button>
            )}
            <Button variant="outline" disabled={busy} onClick={() => void chooseImport()}>
              <Upload /> Import
            </Button>
            <Button
              variant="outline"
              disabled={busy || !file?.exists}
              onClick={() => void exportEnvironment()}
            >
              <Download /> Export
            </Button>
            {mode === "table" && (
              <Input
                className="ml-auto w-56"
                placeholder="Search variables…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            )}
          </div>
          <TabsContent value="table" className="pt-3">
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Key</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead className="w-28 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(({ entry, index }) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Input
                          value={entry.key}
                          placeholder="APP_KEY"
                          onChange={(event) =>
                            setEntry(index, {
                              key: event.target.value.toUpperCase(),
                              secret: /PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY|CREDENTIAL/.test(
                                event.target.value.toUpperCase(),
                              ),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type={entry.secret && !visible[index] ? "password" : "text"}
                          value={entry.value}
                          onChange={(event) => setEntry(index, { value: event.target.value })}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Copy value"
                          disabled={!entry.value}
                          onClick={() => {
                            void navigator.clipboard.writeText(entry.value).then(() => {
                              setCopied(index)
                              window.setTimeout(() => setCopied(null), 1500)
                            })
                          }}
                        >
                          {copied === index ? <Check /> : <Copy />}
                        </Button>
                        {entry.secret && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() =>
                              setVisible((current) => ({ ...current, [index]: !current[index] }))
                            }
                          >
                            {visible[index] ? <EyeOff /> : <Eye />}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Generate secret"
                          onClick={() => void generate(index)}
                        >
                          <RefreshCw />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() =>
                            setEntries((current) =>
                              current.filter((_, entryIndex) => entryIndex !== index),
                            )
                          }
                        >
                          <Trash2 />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!filtered.length && (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  No matching variables
                </p>
              )}
            </div>
            <Button
              className="mt-3"
              variant="outline"
              onClick={() =>
                setEntries((current) => [...current, { key: "", value: "", secret: false }])
              }
            >
              <Plus />
              Add variable
            </Button>
          </TabsContent>
          <TabsContent value="text" className="pt-3">
            <Textarea
              className="min-h-80 font-mono text-xs"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={"APP_ENV=local\nDB_HOST=database\n"}
            />
          </TabsContent>
        </Tabs>
        {message && (
          <Alert
            variant={
              message.startsWith("Environment saved") ||
              message.includes("added from .env.example") ||
              message.includes("successfully")
                ? "default"
                : "destructive"
            }
          >
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="justify-end">
        <Button disabled={busy || !file} onClick={() => void save()}>
          <Save />
          {busy ? "Saving…" : "Save .env"}
        </Button>
      </CardFooter>
      <AlertDialog
        open={Boolean(importPath)}
        onOpenChange={(open) => {
          if (!open && !busy) setImportPath("")
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace project .env?</AlertDialogTitle>
            <AlertDialogDescription>
              The selected file will be validated and will replace the current project environment.
              Existing unsaved edits in this editor will be discarded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void importEnvironment()}>
              {busy ? "Importing…" : "Import and replace"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(deleteProfile)}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleteProfile("")
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete environment profile?</AlertDialogTitle>
            <AlertDialogDescription>
              Profile &quot;{deleteProfile}&quot; will be deleted. The active .env will not be
              changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void removeProfile()}>
              {busy ? "Deleting…" : "Delete profile"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
