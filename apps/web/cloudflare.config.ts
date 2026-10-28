import { defineConfig } from "cf/config"

export default defineConfig({
  worker: {
    name: "mykaoyan-web",
    entrypoint: "./worker-entry.ts",
    compatibilityDate: "2026-10-27",
    compatibilityFlags: ["nodejs_compat"],
    domains: ["mykaoyan.cn"],
    workersDev: false,
    previewUrls: false,
    observability: { enabled: false },
  },
})
