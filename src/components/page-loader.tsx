import { RefreshCw } from "lucide-react"

export function PageLoader({ label }: { label: string }) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="grid gap-3 text-center text-sm text-muted-foreground">
        <RefreshCw className="mx-auto animate-spin" />
        {label}
      </div>
    </div>
  )
}
