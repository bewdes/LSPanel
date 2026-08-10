import * as React from "react"
import { emit } from "@tauri-apps/api/event"
import { invoke } from "@tauri-apps/api/core"
import { Trash2 } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { errorMessage } from "@/lib/errors"
import { pickLanguage } from "@/i18n"

export function DeleteEnvironmentDialog({
  id,
  name,
  busy,
  setBusy,
  setMessage,
  onSaved,
  onBack,
  language,
}: {
  id: string
  name: string
  busy: boolean
  setBusy: (value: boolean) => void
  setMessage: (value: string) => void
  onSaved: (id: string) => void
  onBack: () => void
  language: string
}) {
  const text = pickLanguage(language).environmentWindow
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleteProgress, setDeleteProgress] = React.useState<{
    value: number
    stage: string
  } | null>(null)

  async function remove() {
    if (!id) return
    setBusy(true)
    setMessage("")
    setDeleteProgress({ value: 10, stage: text.preparingRemoval })
    try {
      setDeleteProgress({ value: 35, stage: text.stoppingContainers })
      await invoke("operate_environment", { id, action: "destroy" })
      setDeleteProgress({ value: 85, stage: text.removingData })
      await invoke("delete_environment", { id })
      setDeleteProgress({ value: 95, stage: text.updatingList })
      await emit("environments-changed")
      setDeleteProgress({ value: 100, stage: text.environmentDeleted })
      onSaved(id)
      onBack()
    } catch (error) {
      setMessage(errorMessage(error))
      setDeleteProgress(null)
      setBusy(false)
    }
  }

  return (
    <AlertDialog
      open={deleteOpen}
      onOpenChange={(open) => {
        if (!busy) setDeleteOpen(open)
      }}
    >
      <AlertDialogTrigger render={<Button variant="destructive" disabled={busy || !id} />}>
        <Trash2 />
        {text.deleteLabel}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {deleteProgress ? text.deletingEnvironment : text.deleteEnvironmentTitle(name)}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {deleteProgress ? text.keepOpenHint : text.deleteEnvironmentDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {deleteProgress && (
          <div className="grid gap-2 py-2">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span>{deleteProgress.stage}</span>
              <span className="tabular-nums text-muted-foreground">{deleteProgress.value}%</span>
            </div>
            <Progress value={deleteProgress.value} />
          </div>
        )}
        <AlertDialogFooter>
          {!deleteProgress && <AlertDialogCancel disabled={busy}>{text.cancel}</AlertDialogCancel>}
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={(event) => {
              event.preventDefault()
              void remove()
            }}
          >
            {deleteProgress ? (
              text.deleting
            ) : (
              <>
                <Trash2 />
                {text.deleteEnvironment}
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
