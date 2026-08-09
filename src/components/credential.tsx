import * as React from "react"
import { Check, Copy, Eye, EyeOff } from "lucide-react"

import { pickLanguage } from "@/i18n"
import { Button } from "@/components/ui/button"

export function Credential({
  label,
  value,
  secret = false,
  language,
}: {
  label: string
  value: string
  secret?: boolean
  language: string
}) {
  const text = pickLanguage(language).credential
  const [visible, setVisible] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="grid grid-cols-[90px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border p-3">
      <span className="text-muted-foreground">{label}</span>
      <code className="truncate">{secret && !visible ? "••••••••••••" : value || "—"}</code>
      <div className="flex items-center gap-1">
        {secret && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title={visible ? text.hidePassword : text.showPassword}
            onClick={() => setVisible((current) => !current)}
          >
            {visible ? <EyeOff /> : <Eye />}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={copied ? text.copied : text.copy}
          disabled={!value}
          onClick={() => void copy()}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
    </div>
  )
}
