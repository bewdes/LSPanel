import { invoke } from "@tauri-apps/api/core"

export type DependencyInstallPlan = {
  tool: string
  title: string
  platform: string
  packageManager: string
  commands: string[]
  requiresAdmin: boolean
}

function shouldOpenGuide(error: unknown) {
  const message = String(error)
  return (
    message.includes("not supported") ||
    message.includes("only available") ||
    message.includes("No supported package manager")
  )
}

export async function dependencyInstallPlan(
  tool: string,
  fallbackUrl: string,
): Promise<DependencyInstallPlan | null> {
  try {
    return await invoke<DependencyInstallPlan>("dependency_install_plan", { tool })
  } catch (error) {
    if (shouldOpenGuide(error)) {
      await invoke("open_url", { url: fallbackUrl })
      return null
    }
    throw error
  }
}

/** Installs a dependency through the backend's closed allow-list. */
export async function installTool(tool: string, fallbackUrl: string): Promise<"installed" | "url"> {
  try {
    await invoke<string>("install_dependency", { tool })
    return "installed"
  } catch (error) {
    if (shouldOpenGuide(error)) {
      await invoke("open_url", { url: fallbackUrl })
      return "url"
    }
    throw error
  }
}
