import { z } from "zod"

const result = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]),
    HOST: z.string().trim().min(1),
    PORT: z
      .string()
      .regex(/^[1-9]\d{0,4}$/)
      .refine((value) => Number(value) <= 65535),
  })
  .safeParse(process.env)

if (!result.success) {
  const keys = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))]
  console.error(`启动配置无效：${keys.join("、")}`)
  process.exitCode = 1
} else {
  process.env.HOST = result.data.HOST
  try {
    await import("../.output/server/index.mjs")
  } catch {
    console.error("前端启动失败，请检查构建产物与端口配置。")
    process.exitCode = 1
  }
}
