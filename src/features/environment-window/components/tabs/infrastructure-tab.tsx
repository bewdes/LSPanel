import { RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { TabsContent } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { pickLanguage } from "@/i18n"

export function InfrastructureTab({
  topology,
  busy,
  onRefresh,
  language,
}: {
  topology: string
  busy: boolean
  onRefresh: () => Promise<void>
  language: string
}) {
  const text = pickLanguage(language).environmentWindow
  return (
    <TabsContent value="infrastructure" className="grid gap-2 pt-5">
      <div className="flex items-center justify-between">
        <div>
          <Label>{text.portsVolumesNetworksLabel}</Label>
          <p className="text-xs text-muted-foreground">{text.infrastructureHint}</p>
        </div>
        <Button variant="outline" size="sm" disabled={busy} onClick={onRefresh}>
          <RefreshCw />
          {text.refresh}
        </Button>
      </div>
      <Textarea readOnly className="min-h-96 font-mono text-xs" value={topology} />
    </TabsContent>
  )
}
