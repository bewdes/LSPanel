export type ThemeMode = "dark" | "light" | "system"

let currentMode = "system"
let media: MediaQueryList | null = null

function isDark(mode: string): boolean {
  return mode === "dark" || (mode === "system" && (media?.matches ?? false))
}

export function applyTheme(mode: string) {
  currentMode = mode
  if (!media) {
    media = window.matchMedia("(prefers-color-scheme: dark)")
    // Keeps the panel in sync when the OS theme changes while "system" is
    // selected — applyTheme() only runs on setting changes otherwise, so a
    // live OS switch would never be picked up without this listener.
    media.addEventListener("change", () => {
      document.documentElement.classList.toggle("dark", isDark(currentMode))
    })
  }
  document.documentElement.classList.toggle("dark", isDark(currentMode))
}
