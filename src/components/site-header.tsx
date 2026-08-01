import { pickLanguage } from "@/i18n"
import { siteHeaderText } from "@/i18n/site-header"

import { NotificationCenter } from "@/components/notification-center"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { WindowControls } from "@/components/window-controls"

export function SiteHeader({ uk }: { uk: boolean }) {
  const text = pickLanguage(siteHeaderText, uk)
  return (
    <header
      className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4"
      data-tauri-drag-region
    >
      <SidebarTrigger className="-ml-1" label={text.toggleSidebar} />
      <Separator orientation="vertical" className="mx-2 h-full" />
      <div className="flex-1" />
      <NotificationCenter uk={uk} />
      <WindowControls />
    </header>
  )
}
