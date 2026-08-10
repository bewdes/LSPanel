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

export function EditProjectDialog({
  open,
  onOpenChange,
  name,
  setName,
  domain,
  setDomain,
  group,
  setGroup,
  tags,
  setTags,
  busy,
  onSave,
  language,
}: {
  open: boolean
  onOpenChange: (value: boolean) => void
  name: string
  setName: (value: string) => void
  domain: string
  setDomain: (value: string) => void
  group: string
  setGroup: (value: string) => void
  tags: string
  setTags: (value: string) => void
  busy: boolean
  onSave: () => void
  language: string
}) {
  const text = pickLanguage(language).siteDetails
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{text.projectSettings}</DialogTitle>
          <DialogDescription>{text.projectSettingsDescription}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>{text.name}</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>{text.localDomain}</Label>
            <Input
              value={domain}
              onChange={(event) => setDomain(event.target.value.toLowerCase())}
            />
          </div>
          <div className="grid gap-2">
            <Label>{text.group}</Label>
            <Input
              value={group}
              maxLength={48}
              onChange={(event) => setGroup(event.target.value)}
              placeholder={text.groupPlaceholder}
            />
          </div>
          <div className="grid gap-2">
            <Label>{text.tags}</Label>
            <Input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder={text.tagsPlaceholder}
            />
            <p className="text-xs text-muted-foreground">{text.tagsHint}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            {text.cancel}
          </Button>
          <Button disabled={busy || !name || !domain} onClick={onSave}>
            {busy ? text.saving : text.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
