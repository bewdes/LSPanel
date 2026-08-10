import { Button } from "@/components/ui/button"
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
import { pickLanguage } from "@/i18n"

export function CheckoutConflictDialog({
  pendingCheckout,
  onOpenChange,
  checkoutBranch,
  busy,
  language,
}: {
  pendingCheckout: { branch: string; create: boolean } | null
  onOpenChange: (value: boolean) => void
  checkoutBranch: (
    branch: string,
    create?: boolean,
    options?: { stash?: boolean; force?: boolean },
  ) => Promise<void>
  busy: boolean
  language: string
}) {
  const text = pickLanguage(language).siteDetails
  return (
    <AlertDialog
      open={Boolean(pendingCheckout)}
      onOpenChange={(open) => !open && onOpenChange(false)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{text.uncommittedChangesTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {pendingCheckout && text.uncommittedChangesDescription(pendingCheckout.branch)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{text.cancel}</AlertDialogCancel>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              pendingCheckout &&
              void checkoutBranch(pendingCheckout.branch, pendingCheckout.create, { stash: true })
            }
          >
            {text.stashAndSwitch}
          </Button>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={(event) => {
              event.preventDefault()
              if (pendingCheckout)
                void checkoutBranch(pendingCheckout.branch, pendingCheckout.create, { force: true })
            }}
          >
            {text.discardAndSwitch}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
