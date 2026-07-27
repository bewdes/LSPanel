import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return
          if (id.includes("@xterm/")) return "terminal-vendor"
          if (id.includes("@tauri-apps/")) return "tauri-vendor"
          if (id.includes("@base-ui/")) return "ui-vendor"
          if (id.includes("lucide-react")) return "icons-vendor"
          if (id.includes("react") || id.includes("scheduler")) return "ui-vendor"
        },
      },
    },
  },
})
