import { WindowControls } from "@/components/window-controls"

export function StandaloneHeader({ title }: { title: string }) {
  return (
    <header className="flex h-14 items-center border-b bg-background px-4" data-tauri-drag-region>
      <div className="flex items-center gap-2" data-tauri-drag-region>
        <span className="grid size-7 place-items-center rounded-lg border bg-card text-[10px] font-semibold">
          LS
        </span>
        <strong className="text-sm" data-tauri-drag-region>
          {title}
        </strong>
      </div>
      <WindowControls />
    </header>
  )
}
