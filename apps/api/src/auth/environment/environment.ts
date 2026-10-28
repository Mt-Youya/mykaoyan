import { z } from "zod"
import { StartupConfigError } from "../../common"
import type { Environment } from "../../environment"

/**
 * 认证相关的启动配置：在 `createApplication` 装配 provider 时解析一次。
 *
 * 规则（docs/ARCHITECTURE.md「写法约定」）：未设置、空串、有值三态都要显式；缺失或空串直接启动失败。
 * - `BETTER_AUTH_SECRET` 最少 32 个字符，生产缺失即失败。
 * - `NODE_ENV=test` 强制内存短信实现，凭据缺失也允许，绝不真实发送。
 * - 生产环境只允许 `SMS_PROVIDER=aliyun`，且阿里云凭据必须齐全。
 */
const TEST_SECRET = "test-only-better-auth-secret-do-not-use"
const TEST_URL = "http://127.0.0.1:3001"

const aliyunSchema = z.object({
  ALIYUN_ACCESS_KEY_ID: z.string().trim().min(1),
  ALIYUN_ACCESS_KEY_SECRET: z.string().trim().min(1),
  ALIYUN_SMS_SIGN_NAME: z.string().trim().min(1),
  ALIYUN_SMS_TEMPLATE_CODE: z.string().trim().min(1),
  ALIYUN_SMS_TEMPLATE_PARAM: z.string().trim().min(1).default('{"code":"##code##","min":"5"}'),
  ALIYUN_DYPNS_ENDPOINT: z.string().trim().min(1).default("https://dypnsapi.aliyuncs.com"),
})

export type AliyunAuthEnvironment = {
  provider: "aliyun"
  accessKeyId: string
  accessKeySecret: string
  signName: string
  templateCode: string
  templateParam: string
  endpoint: string
}

export type AuthEnvironment = {
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL: string
  /** 允许携带 cookie 调认证接口的前端 origin；默认只放 `BETTER_AUTH_URL`。 */
  trustedOrigins: string[]
  sms: AliyunAuthEnvironment | { provider: "memory" }
}

const httpUrl = z
  .string()
  .trim()
  .min(1)
  .refine((value) => URL.canParse(value) && ["http:", "https:"].includes(new URL(value).protocol), {
    message: "必须是 http(s) 地址",
  })

function fail(keys: string[]): never {
  throw new StartupConfigError(`认证启动配置缺失或无效：${[...new Set(keys)].join("、")}`)
}

export function readAuthEnvironment(
  input: Record<string, string | undefined>,
  nodeEnv: Environment["NODE_ENV"]
): AuthEnvironment {
  const testing = nodeEnv === "test"
  const production = nodeEnv === "production"

  const base = z
    .object({
      BETTER_AUTH_SECRET: testing ? z.string().min(32).default(TEST_SECRET) : z.string().min(32),
      BETTER_AUTH_URL: testing ? httpUrl.default(TEST_URL) : httpUrl,
      AUTH_TRUSTED_ORIGINS: z.string().trim().min(1).optional(),
      SMS_PROVIDER: testing ? z.string().optional() : z.enum(["aliyun", "memory"]),
    })
    .safeParse(input)
  if (!base.success) fail(base.error.issues.map((issue) => issue.path.join(".")))

  const provider = testing ? "memory" : base.data.SMS_PROVIDER
  if (!provider) fail(["SMS_PROVIDER"])
  if (production && provider !== "aliyun") fail(["SMS_PROVIDER"])

  const origins = (base.data.AUTH_TRUSTED_ORIGINS ?? base.data.BETTER_AUTH_URL)
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)

  if (provider === "memory") {
    return {
      BETTER_AUTH_SECRET: base.data.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: base.data.BETTER_AUTH_URL,
      trustedOrigins: origins,
      sms: { provider: "memory" },
    }
  }

  const aliyun = aliyunSchema.safeParse(input)
  if (!aliyun.success) fail(aliyun.error.issues.map((issue) => issue.path.join(".")))
  return {
    BETTER_AUTH_SECRET: base.data.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: base.data.BETTER_AUTH_URL,
    trustedOrigins: origins,
    sms: {
      provider: "aliyun",
      accessKeyId: aliyun.data.ALIYUN_ACCESS_KEY_ID,
      accessKeySecret: aliyun.data.ALIYUN_ACCESS_KEY_SECRET,
      signName: aliyun.data.ALIYUN_SMS_SIGN_NAME,
      templateCode: aliyun.data.ALIYUN_SMS_TEMPLATE_CODE,
      templateParam: aliyun.data.ALIYUN_SMS_TEMPLATE_PARAM,
      endpoint: aliyun.data.ALIYUN_DYPNS_ENDPOINT,
    },
  }
}
