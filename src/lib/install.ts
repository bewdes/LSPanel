import { invoke } from "@tauri-apps/api/core"
import { homeDir } from "@tauri-apps/api/path"

/**
 * Copies a known install command to the clipboard and opens a terminal for
 * the user to paste and run it themselves, or falls back to opening the
 * project's official install/download page when no command is known for
 * this system. LS Panel never executes installer or package-manager
 * commands itself.
 */
export async function installTool(tool: string, fallbackUrl: string): Promise<"command" | "url"> {
  const command = await invoke<string | null>("dependency_install_command", { tool }).catch(
    () => null,
  )
  if (command) {
    await navigator.clipboard.writeText(command)
    const home = await homeDir()
    await invoke("open_terminal", { path: home }).catch(() => {})
    return "command"
  }
  await invoke("open_url", { url: fallbackUrl })
  return "url"
}
