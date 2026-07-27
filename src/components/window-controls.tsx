import { getCurrentWindow } from "@tauri-apps/api/window"
import { Minus, Square, X } from "lucide-react"

import { Button } from "@/components/ui/button"

export function WindowControls() {
  const window = getCurrentWindow()
  return (
    <div className="ml-auto flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Minimize"
        onClick={() => window.minimize()}
      >
        <Minus />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Maximize"
        onClick={() => window.toggleMaximize()}
      >
        <Square />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={() => window.close()}>
        <X />
      </Button>
    </div>
  )
}

export function ResizeHandles() {
  const window = getCurrentWindow()
  const handles: Array<[ResizeDirection, string]> = [
    ["North", "top-0 left-2 right-2 h-1 cursor-ns-resize"],
    ["South", "bottom-0 left-2 right-2 h-1 cursor-ns-resize"],
    ["East", "right-0 top-2 bottom-2 w-1 cursor-ew-resize"],
    ["West", "left-0 top-2 bottom-2 w-1 cursor-ew-resize"],
    ["NorthEast", "right-0 top-0 size-2 cursor-nesw-resize"],
    ["NorthWest", "left-0 top-0 size-2 cursor-nwse-resize"],
    ["SouthEast", "right-0 bottom-0 size-2 cursor-nwse-resize"],
    ["SouthWest", "left-0 bottom-0 size-2 cursor-nesw-resize"],
  ]
  return (
    <>
      {handles.map(([direction, className]) => (
        <div
          key={direction}
          className={`fixed z-[100] ${className}`}
          onMouseDown={(event) => {
            event.preventDefault()
            void window.startResizeDragging(direction)
          }}
        />
      ))}
    </>
  )
}

type ResizeDirection =
  "East" | "North" | "NorthEast" | "NorthWest" | "South" | "SouthEast" | "SouthWest" | "West"
