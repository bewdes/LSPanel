import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import {
  ChevronRight,
  Code2,
  Copy,
  File,
  FilePlus2,
  Folder,
  FolderPlus,
  HardDrive,
  ExternalLink,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Trash2,
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
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type ProjectFileEntry = {
  name: string
  path: string
  directory: boolean
  size: number
  modifiedAt?: number
  hidden: boolean
  permissions?: string
  owner?: string
}

type ProjectTextFile = { path: string; text: string; size: number }

export function ProjectFileManager({ siteId }: { siteId: string }) {
  const [directory, setDirectory] = React.useState("")
  const [entries, setEntries] = React.useState<ProjectFileEntry[]>([])
  const [selected, setSelected] = React.useState<ProjectFileEntry | null>(null)
  const [opened, setOpened] = React.useState<ProjectTextFile | null>(null)
  const [text, setText] = React.useState("")
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<ProjectFileEntry[] | null>(null)
  const [newName, setNewName] = React.useState("")
  const [renameName, setRenameName] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState("")
  const [deletePath, setDeletePath] = React.useState("")
  const [permissionMode, setPermissionMode] = React.useState("")
  const [usage, setUsage] = React.useState<{
    bytes: number
    files: number
    directories: number
  } | null>(null)

  const load = React.useCallback(
    async (path = directory) => {
      setBusy(true)
      setMessage("")
      try {
        setEntries(await invoke<ProjectFileEntry[]>("list_project_files", { siteId, path }))
        setDirectory(path)
        setResults(null)
        setSelected(null)
      } catch (error) {
        setMessage(String(error))
      } finally {
        setBusy(false)
      }
    },
    [directory, siteId],
  )

  React.useEffect(() => {
    void load("")
  }, [siteId]) // eslint-disable-line react-hooks/exhaustive-deps

  const openEntry = async (entry: ProjectFileEntry) => {
    setSelected(entry)
    setRenameName(entry.name)
    setPermissionMode(entry.permissions?.replace(/^0/, "") ?? "")
    setUsage(null)
    if (entry.directory) {
      await load(entry.path)
      return
    }
    setBusy(true)
    setMessage("")
    try {
      const file = await invoke<ProjectTextFile>("read_project_file", {
        siteId,
        path: entry.path,
      })
      setOpened(file)
      setText(file.text)
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }

  const create = async (folder: boolean) => {
    const path = [directory, newName.trim()].filter(Boolean).join("/")
    if (!path) return
    setBusy(true)
    setMessage("")
    try {
      if (folder) await invoke("create_project_directory", { siteId, path })
      else await invoke("write_project_file", { siteId, path, text: "" })
      setNewName("")
      await load(directory)
      setMessage(`${folder ? "Directory" : "File"} created successfully.`)
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!opened) return
    setBusy(true)
    setMessage("")
    try {
      const file = await invoke<ProjectTextFile>("write_project_file", {
        siteId,
        path: opened.path,
        text,
      })
      setOpened(file)
      setMessage("Project file saved successfully.")
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }

  const rename = async () => {
    if (!selected || !renameName.trim()) return
    setBusy(true)
    setMessage("")
    try {
      const path = await invoke<string>("rename_project_file", {
        siteId,
        path: selected.path,
        newName: renameName.trim(),
      })
      if (opened?.path === selected.path) setOpened({ ...opened, path })
      await load(directory)
      setMessage("Project item renamed successfully.")
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    setMessage("")
    try {
      await invoke("delete_project_file", { siteId, path: deletePath })
      if (opened?.path === deletePath) setOpened(null)
      setDeletePath("")
      await load(directory)
      setMessage("Project item deleted successfully.")
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }

  const search = async () => {
    if (query.trim().length < 2) {
      setResults(null)
      return
    }
    setBusy(true)
    try {
      setResults(await invoke<ProjectFileEntry[]>("search_project_files", { siteId, query }))
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }
  const calculateUsage = async () => {
    if (!selected) return
    setBusy(true)
    setMessage("")
    try {
      setUsage(
        await invoke("project_file_usage", {
          siteId,
          path: selected.path,
        }),
      )
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }
  const applyPermissions = async () => {
    if (!selected) return
    setBusy(true)
    setMessage("")
    try {
      await invoke("set_project_file_permissions", {
        siteId,
        path: selected.path,
        mode: permissionMode,
      })
      setSelected({ ...selected, permissions: `0${permissionMode}` })
      setMessage("Project item permissions updated successfully.")
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }

  const displayed = results ?? entries
  const crumbs = directory ? directory.split("/") : []
  const quickConfigs =
    directory || results
      ? []
      : entries.filter((entry) =>
          [
            ".env",
            ".env.example",
            "compose.yaml",
            "docker-compose.yml",
            "Dockerfile",
            "package.json",
            "composer.json",
            "php.ini",
          ].includes(entry.name),
        )
  const withAbsolutePath = async (
    entry: ProjectFileEntry,
    action: (absolutePath: string) => void | Promise<void>,
  ) => {
    try {
      const absolutePath = await invoke<string>("project_file_absolute_path", {
        siteId,
        path: entry.path,
      })
      await action(absolutePath)
    } catch (error) {
      setMessage(String(error))
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.8fr)_minmax(420px,1.2fr)]">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">Project files</CardTitle>
          <div className="flex flex-wrap items-center gap-1 text-sm">
            <Button variant="ghost" size="sm" onClick={() => void load("")}>
              Project
            </Button>
            {crumbs.map((crumb, index) => (
              <React.Fragment key={`${crumb}-${index}`}>
                <ChevronRight className="size-3 text-muted-foreground" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void load(crumbs.slice(0, index + 1).join("/"))}
                >
                  {crumb}
                </Button>
              </React.Fragment>
            ))}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex gap-2">
            <Input
              placeholder="Search names…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void search()}
            />
            <Button variant="outline" size="icon" disabled={busy} onClick={() => void search()}>
              <Search />
            </Button>
            <Button variant="outline" size="icon" disabled={busy} onClick={() => void load()}>
              <RefreshCw className={busy ? "animate-spin" : ""} />
            </Button>
          </div>
          {quickConfigs.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {quickConfigs.map((entry) => (
                <Button
                  key={entry.path}
                  variant="secondary"
                  size="sm"
                  onClick={() => void openEntry(entry)}
                >
                  <File />
                  {entry.name}
                </Button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              placeholder="New file or directory"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
            <Button
              title="Create file"
              variant="outline"
              size="icon"
              disabled={busy || !newName.trim()}
              onClick={() => void create(false)}
            >
              <FilePlus2 />
            </Button>
            <Button
              title="Create directory"
              variant="outline"
              size="icon"
              disabled={busy || !newName.trim()}
              onClick={() => void create(true)}
            >
              <FolderPlus />
            </Button>
          </div>
          <div className="max-h-[520px] overflow-auto rounded-lg border">
            {displayed.map((entry) => (
              <button
                key={entry.path}
                className="flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted"
                onClick={() => void openEntry(entry)}
              >
                {entry.directory ? <Folder className="size-4" /> : <File className="size-4" />}
                <span className="min-w-0 flex-1 truncate">{entry.path}</span>
                {!entry.directory && (
                  <span className="text-xs text-muted-foreground">{formatSize(entry.size)}</span>
                )}
              </button>
            ))}
            {!displayed.length && (
              <p className="p-8 text-center text-sm text-muted-foreground">No files found</p>
            )}
          </div>
          {selected && (
            <div className="grid gap-2 rounded-lg border p-3">
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>Permissions: {selected.permissions ?? "—"}</span>
                <span>Owner: {selected.owner ?? "—"}</span>
                <span>Size: {selected.directory ? "Directory" : formatSize(selected.size)}</span>
                <span>
                  Modified:{" "}
                  {selected.modifiedAt
                    ? new Date(selected.modifiedAt * 1000).toLocaleString()
                    : "—"}
                </span>
                {usage && (
                  <>
                    <span>Total size: {formatSize(usage.bytes)}</span>
                    <span>
                      {usage.files} files · {usage.directories} directories
                    </span>
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void calculateUsage()}
                >
                  <HardDrive />
                  {busy ? "Calculating…" : "Calculate size"}
                </Button>
                <Input
                  className="w-24 font-mono"
                  aria-label="Unix permissions"
                  maxLength={3}
                  value={permissionMode}
                  onChange={(event) =>
                    setPermissionMode(event.target.value.replace(/[^0-7]/g, "").slice(0, 3))
                  }
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || permissionMode.length !== 3}
                  onClick={() => void applyPermissions()}
                >
                  Apply permissions
                </Button>
              </div>
              <div className="flex gap-2">
                <Input value={renameName} onChange={(event) => setRenameName(event.target.value)} />
                <Button variant="outline" size="icon" disabled={busy} onClick={() => void rename()}>
                  <Pencil />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  title="Copy absolute path"
                  disabled={busy}
                  onClick={() =>
                    void withAbsolutePath(selected, (path) => navigator.clipboard.writeText(path))
                  }
                >
                  <Copy />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  title="Open with system application"
                  disabled={busy}
                  onClick={() =>
                    void withAbsolutePath(selected, (path) => invoke("open_path", { path }))
                  }
                >
                  <ExternalLink />
                </Button>
                {!selected.directory && (
                  <Button
                    variant="outline"
                    size="icon"
                    title="Open in code editor"
                    disabled={busy}
                    onClick={() =>
                      void withAbsolutePath(selected, (path) => invoke("open_editor", { path }))
                    }
                  >
                    <Code2 />
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="icon"
                  disabled={busy}
                  onClick={() => setDeletePath(selected.path)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="min-w-0">
        <CardHeader className="flex-row items-center">
          <CardTitle className="min-w-0 flex-1 truncate text-base">
            {opened?.path ?? "Text editor"}
          </CardTitle>
          <Button disabled={busy || !opened} onClick={() => void save()}>
            <Save /> Save
          </Button>
        </CardHeader>
        <CardContent>
          <Textarea
            className="min-h-[540px] resize-y font-mono text-xs"
            disabled={!opened}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Select a text file to open it."
          />
        </CardContent>
      </Card>
      {message && (
        <Alert
          className="xl:col-span-2"
          variant={message.includes("successfully") ? "default" : "destructive"}
        >
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      <AlertDialog open={Boolean(deletePath)} onOpenChange={(open) => !open && setDeletePath("")}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project item?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletePath} will be permanently deleted. Directories must be empty.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void remove()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
