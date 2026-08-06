import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { Bell, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { pickLanguage } from "@/i18n"

type AppNotification = {
  id: string
  category: string
  title: string
  body: string
  createdAt: number
  read: boolean
}

export function NotificationCenter({ language }: { language: string }) {
  const text = pickLanguage(language).notificationCenter
  const [notifications, setNotifications] = React.useState<AppNotification[]>([])
  const [open, setOpen] = React.useState(false)

  const categoryLabels: Record<string, string> = {
    operation: text.categoryOperation,
    "disk-space": text.categoryDiskSpace,
    "auto-stop": text.categoryAutoStop,
    "auto-heal": text.categoryAutoHeal,
    "git-status": text.categoryGitStatus,
    tls: text.categoryTls,
    settings: text.categorySettings,
    "environment-save": text.categoryEnvironmentSave,
    "site-update": text.categorySiteUpdate,
    file: text.categoryFile,
    certificate: text.categoryCertificate,
    livelink: text.categoryLivelink,
    "environment-file": text.categoryEnvironmentFile,
    git: text.categoryGit,
    "container-service": text.categoryContainerService,
  }

  const refresh = React.useCallback(
    () =>
      invoke<AppNotification[]>("list_notifications")
        .then(setNotifications)
        .catch(() => undefined),
    [],
  )

  React.useEffect(() => {
    void refresh()
    const listener = listen<AppNotification>("notification-created", ({ payload }) => {
      setNotifications((current) => [payload, ...current].slice(0, 200))
    })
    return () => {
      void listener.then((dispose) => dispose())
    }
  }, [refresh])

  const unread = notifications.filter((notification) => !notification.read).length

  const handleOpenChange = (value: boolean) => {
    setOpen(value)
    if (value && unread > 0) {
      void invoke<AppNotification[]>("mark_notifications_read")
        .then(setNotifications)
        .catch(() => undefined)
    }
  }

  const clearAll = () => {
    void invoke<AppNotification[]>("clear_notifications")
      .then(setNotifications)
      .catch(() => undefined)
  }

  const remove = (id: string) => {
    void invoke<AppNotification[]>("delete_notification", { id })
      .then(setNotifications)
      .catch(() => undefined)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger
        render={
          <Button
            className="relative"
            variant="ghost"
            size="icon-sm"
            aria-label={text.notifications}
          />
        }
      >
        <Bell />
        {unread > 0 && (
          <span className="absolute right-1 top-1 size-2 rounded-full bg-destructive" />
        )}
      </SheetTrigger>
      <SheetContent className="w-full min-w-0 overflow-x-hidden sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{text.notifications}</SheetTitle>
          <SheetDescription>{text.notificationsDescription}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-4">
          <div className="grid min-w-0 gap-3">
            {notifications.map((notification) => (
              <div key={notification.id} className="grid min-w-0 gap-1 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {categoryLabels[notification.category] ?? notification.category}
                  </Badge>
                  {!notification.read && (
                    <span className="size-1.5 shrink-0 rounded-full bg-destructive" />
                  )}
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {new Date(notification.createdAt).toLocaleString()}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title={text.delete}
                    onClick={() => remove(notification.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <p className="min-w-0 break-words text-sm [overflow-wrap:anywhere]">
                  {notification.body}
                </p>
              </div>
            ))}
            {!notifications.length && (
              <div className="grid place-items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
                <Bell className="size-7" />
                <p className="text-sm">{text.empty}</p>
              </div>
            )}
          </div>
        </div>
        <SheetFooter className="flex items-center gap-2 border-t px-4 py-3">
          <Button
            className="ml-auto"
            variant="destructive"
            size="sm"
            disabled={!notifications.length}
            onClick={clearAll}
          >
            <Trash2 />
            {text.clearAll}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
