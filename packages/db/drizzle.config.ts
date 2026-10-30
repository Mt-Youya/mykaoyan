import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "postgresql",
  schema: [
    "./src/membership/index.ts",
    "./src/accounts/index.ts",
    "./src/catalog/index.ts",
    "./src/admin/index.ts",
    "./src/progress/index.ts",
    "./src/agent-tokens/index.ts",
    "./src/publishing/index.ts",
  ],
  out: "./supabase/migrations",
  migrations: { prefix: "supabase" },
})
