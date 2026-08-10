import type { Environment } from "@/types"

export function splitCommand(value: string) {
  const result: string[] = []
  let current = ""
  let quote = ""
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (quote) {
      if (character === quote) {
        quote = ""
      } else if (character === "\\" && index + 1 < value.length) {
        current += value[++index]
      } else current += character
    } else if (character === '"' || character === "'") {
      quote = character
    } else if (/\s/.test(character)) {
      if (current) {
        result.push(current)
        current = ""
      }
    } else current += character
  }
  if (quote) throw new Error("Command contains an unclosed quote")
  if (current) result.push(current)
  if (!result.length) throw new Error("Enter a command")
  return result
}

export function nodeScriptEntries(value: string | null): Array<[string, string]> {
  if (!value) return []
  try {
    const scripts = JSON.parse(value) as Record<string, unknown>
    return Object.entries(scripts).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    )
  } catch {
    return []
  }
}

export function xdebugIdeConfiguration(ide: string, environment: Environment) {
  if (ide === "PhpStorm") {
    return [
      `Xdebug port: ${environment.phpXdebugPort}`,
      `IDE key: ${environment.phpXdebugIdeKey}`,
      "Server host: project .localhost domain",
      "Debugger: Xdebug",
      "Path mapping: /var/www/sites → parent directory containing your LS Panel projects",
      "Enable: PHP > Debug > Start Listening for PHP Debug Connections",
    ].join("\n")
  }
  return JSON.stringify(
    {
      version: "0.2.0",
      configurations: [
        {
          name: "Listen for LS Panel Xdebug",
          type: "php",
          request: "launch",
          port: environment.phpXdebugPort,
          pathMappings: { "/var/www/sites": "${workspaceFolder}/.." },
          xdebugSettings: { max_children: 128, max_data: 1024, max_depth: 5 },
        },
      ],
    },
    null,
    2,
  )
}

export function nodeInspectorConfiguration(port: number) {
  return JSON.stringify(
    {
      version: "0.2.0",
      configurations: [
        {
          name: "Attach to LS Panel Node.js",
          type: "node",
          request: "attach",
          address: "127.0.0.1",
          port,
          restart: true,
          localRoot: "${workspaceFolder}",
          remoteRoot: "/var/www/sites/${workspaceFolderBasename}",
          skipFiles: ["<node_internals>/**"],
        },
      ],
    },
    null,
    2,
  )
}
