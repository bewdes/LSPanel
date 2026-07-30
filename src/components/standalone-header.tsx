import { WindowControls } from "@/components/window-controls"

export function StandaloneHeader({ title: _title }: { title: string }) {
  return (
    <header className="flex h-14 items-center bg-background px-4" data-tauri-drag-region>
      <div className="flex items-center gap-2" data-tauri-drag-region></div>
      <WindowControls />
    </header>
  )
}
