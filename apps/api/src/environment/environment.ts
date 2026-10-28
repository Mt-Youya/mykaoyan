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
    MEDIA_SIGNING_KEY: z.string().min(32),
    MEDIA_BASE_URL: z.string().trim().min(1).optional(),
  })
  .superRefine((config, ctx) => {
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
