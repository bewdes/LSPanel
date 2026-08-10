import { RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { TabsContent } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { pickLanguage } from "@/i18n"

import type { Inspection } from "../../types"

export function LogsTab({
  inspection,
  busy,
  onRefresh,
  language,
}: {
  inspection: Inspection | null
  busy: boolean
  onRefresh: () => Promise<void>
  language: string
}) {
  const text = pickLanguage(language).environmentWindow
  return (
    <TabsContent value="logs" className="grid gap-2 pt-5">
      <div className="flex items-center justify-between">
        <Label>{text.recentLogsLabel}</Label>
        <Button variant="outline" size="sm" disabled={busy} onClick={onRefresh}>
          <RefreshCw />
          {text.refresh}
        </Button>
      </div>
      {inspection?.logs ? (
        <Textarea readOnly className="min-h-[420px] font-mono text-xs" value={inspection.logs} />
      ) : (
        <p className="text-sm text-muted-foreground">{text.noLogsAvailable}</p>
      )}
    </TabsContent>
  )
}
