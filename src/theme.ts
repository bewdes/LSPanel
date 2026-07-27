export type ThemeMode = "dark" | "light" | "system"

export function applyTheme(mode: string) {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches
  const dark = mode === "dark" || (mode === "system" && systemDark)
  document.documentElement.classList.toggle("dark", dark)
}
