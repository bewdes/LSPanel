import { Button } from "@/components/ui/button"
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
import { pickLanguage } from "@/i18n"

export function DuplicateProjectDialog({
  open,
  onOpenChange,
  name,
  setName,
  domain,
  setDomain,
  busy,
  onDuplicate,
  language,
}: {
  open: boolean
  onOpenChange: (value: boolean) => void
  name: string
  setName: (value: string) => void
  domain: string
  setDomain: (value: string) => void
  busy: boolean
  onDuplicate: () => void
  language: string
}) {
  const text = pickLanguage(language).siteDetails
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{text.duplicateProject}</DialogTitle>
          <DialogDescription>{text.duplicateProjectDescription}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>{text.newName}</Label>
            <Input
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setDomain(`${event.target.value.toLowerCase().replace(/_/g, "-")}.localhost`)
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label>{text.newDomain}</Label>
            <Input
              value={domain}
              onChange={(event) => setDomain(event.target.value.toLowerCase())}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            {text.cancel}
          </Button>
          <Button disabled={busy || !name || !domain} onClick={onDuplicate}>
            {busy ? text.duplicating : text.duplicate}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
