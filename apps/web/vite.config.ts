import { fileURLToPath } from "node:url"

import { cloudflare } from "@cloudflare/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"

export default defineConfig(({ mode }) => ({
  plugins: [
    tailwindcss(),
    ...(mode === "workers" ? [cloudflare({ viteEnvironment: { name: "ssr" } })] : []),
    tanstackStart(),
    ...(mode === "workers"
      ? []
      : [
          nitro({
            preset: "node-server",
            // 本地开发时把浏览器的相对 /api 请求转发到 API 服务（仅影响 dev）。
            // 这里用 Nitro 的 devProxy 而不是 Vite 的 server.proxy：TanStack Start 的
            // Nitro dev 中间件注册在 Vite proxy 之前并接管请求，server.proxy 收不到 /api。
            devProxy: { "/api/**": { target: "http://127.0.0.1:3001", changeOrigin: false } },
          }),
        ]),
    react(),
  ],
  resolve: {
    alias: [
      {
        find: "@",
        replacement: fileURLToPath(new URL("./src", import.meta.url)),
      },
    ],
  },

  build: {
    rolldownOptions: {
      output: {
        chunkFileNames: "assets/js/[name]-[hash].js",
        entryFileNames: "assets/js/[name].[hash].js",
        codeSplitting: {
          groups: [
            {
              name(moduleId) {
                if (moduleId.includes("tanstack")) return "tanstack"
                if (moduleId.includes("markdown")) return "markdown"
                if (moduleId.includes("remark")) return "remark"
                if (moduleId.includes("hugeicons")) return "hugeicons"
                if (moduleId.includes("motion")) return "motion"
                if (moduleId.includes("gsap")) return "gsap"
                if (moduleId.includes("chart")) return "charts"
                return null
              },
            },
          ],
        },
        minify: true,
      },
    },
  },
}))
