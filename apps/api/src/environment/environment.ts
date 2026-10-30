import { z } from "zod"

import { StartupConfigError } from "../common"

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]),
    PORT: z.coerce.number().int().min(1).max(65535),
    DATABASE_URL: z
      .string()
      .refine((value) => URL.canParse(value) && ["postgres:", "postgresql:"].includes(new URL(value).protocol), {
        abort: true,
      })
      .optional(),
    DATABASE_CA: z.string().trim().min(1).optional(),
    COMMUNITY_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    MEDIA_SIGNING_KEY: z.string().min(32),
    R2_ACCOUNT_ID: z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .optional(),
    R2_ACCESS_KEY_ID: z.string().trim().min(1).optional(),
    R2_SECRET_ACCESS_KEY: z.string().trim().min(1).optional(),
    R2_BUCKET: z.string().trim().min(1).optional(),
    R2_ENDPOINT: z.url().optional(),
    MEDIA_BASE_URL: z.string().trim().min(1).optional(),
  })
  .superRefine((config, ctx) => {
    const r2Keys = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_ENDPOINT"] as const
    if (r2Keys.some((key) => config[key] !== undefined)) {
      for (const key of r2Keys)
        if (config[key] === undefined) ctx.addIssue({ code: "custom", path: [key], message: "R2 配置须整组提供" })
      if (config.R2_ACCOUNT_ID && config.R2_ENDPOINT !== `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`)
        ctx.addIssue({ code: "custom", path: ["R2_ENDPOINT"], message: "R2 端点不匹配" })
    }
    // 未配置数据库时只装配不依赖数据库的模块（本地招生目录查询）；生产必须配置。
    if (config.DATABASE_URL === undefined) {
      if (config.NODE_ENV === "production") {
        ctx.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "生产环境必须配置数据库" })
      }
      return
    }
    const url = new URL(config.DATABASE_URL)
    const testing = config.NODE_ENV === "test" && ["127.0.0.1", "localhost"].includes(url.hostname)
    if (config.NODE_ENV === "test" && !testing) {
      ctx.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "测试只允许本机临时库" })
    }
    if (!testing && (url.port !== "6543" || url.searchParams.get("sslmode") !== "verify-full")) {
      ctx.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "需要事务连接池与完整 TLS 验证" })
    }
  })

export type Environment = z.infer<typeof environmentSchema>

export function readEnvironment(input: Record<string, string | undefined>): Environment {
  const result = environmentSchema.safeParse(input)
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))]
    throw new StartupConfigError(`启动配置缺失或无效：${keys.join("、")}`)
  }
  return result.data
}
