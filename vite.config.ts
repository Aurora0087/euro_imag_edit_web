import { defineConfig, loadEnv } from "vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const config = defineConfig(({ mode }) => {
  // loadEnv reads .env (unlike plain process.env, which Vite does NOT
  // populate from .env for the config file itself) so the dev proxy target
  // stays in sync with VITE_API_URL instead of silently falling back to
  // localhost:8000.
  const env = loadEnv(mode, process.cwd(), "")
  const apiTarget = env.VITE_API_URL || env.API_URL || "http://localhost:8000"

  return {
    resolve: { tsconfigPaths: true },
    plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
    server: {
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
        "/health": { target: apiTarget, changeOrigin: true },
      },
    },
  }
})

export default config
