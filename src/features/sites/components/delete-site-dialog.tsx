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
import { Checkbox } from "@/components/ui/checkbox"
import { pickLanguage } from "@/i18n"

export function DeleteSiteDialog({
  open,
  onOpenChange,
  siteName,
  deleteFiles,
  setDeleteFiles,
  dirty,
  changedFiles,
  busy,
  onDelete,
  language,
}: {
  open: boolean
  onOpenChange: (value: boolean) => void
  siteName: string
  deleteFiles: boolean
  setDeleteFiles: (value: boolean) => void
  dirty: boolean | undefined
  changedFiles: number
  busy: boolean
  onDelete: () => void
  language: string
}) {
  const text = pickLanguage(language).siteDetails
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{text.deleteSiteTitle}</AlertDialogTitle>
          <AlertDialogDescription>{text.deleteSiteDescription(siteName)}</AlertDialogDescription>
          {dirty && (
            <Alert variant="destructive">
              <AlertDescription>{text.gitDirtyWarning(changedFiles)}</AlertDescription>
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
              onDelete()
            }}
          >
            {text.delete}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
