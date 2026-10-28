import { memoryAdapter } from "better-auth/adapters/memory"
import type { MemoryDB } from "better-auth/adapters/memory"
import { describe, expect, it } from "vitest"
import { createAuth } from "../auth"
import type { AuthEnvironment } from "../environment"
import { MemorySmsVerifier } from "../sms"

const env: AuthEnvironment = {
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://127.0.0.1:3001",
  trustedOrigins: ["http://127.0.0.1:3001"],
  sms: { provider: "memory" },
}

/** `updateAge: 0` 让每次 getSession 都触发滑动刷新，便于稳定断言刷新后的 Set-Cookie。 */
function build() {
  const db: MemoryDB = { user: [], session: [], account: [], verification: [] }
  const sms = new MemorySmsVerifier()
  const auth = createAuth({ env, sms, database: memoryAdapter(db), session: { expiresIn: 3600, updateAge: 0 } })
  return { auth, sms, db }
}

async function login(auth: ReturnType<typeof build>["auth"], sms: MemorySmsVerifier, phone = "13800138000") {
  const e164 = `+86${phone}`
  await sms.sendCode(e164)
  const result = await auth.api.verifyPhoneNumber({
    body: { phoneNumber: e164, code: sms.peekCode(e164)! },
    returnHeaders: true,
  })
  const cookie = result.headers.getSetCookie()[0]?.split(";")[0]
  if (!cookie) throw new Error("登录没有拿到会话 cookie")
  return { cookie, accountId: result.response.user.id }
}

describe("Better Auth 会话（真实实例 + 内存 adapter）", () => {
  it("SSR 读取会话时若发生滑动刷新，响应里会带新的 Set-Cookie", async () => {
    const { auth, sms } = build()
    const { cookie } = await login(auth, sms)

    const result = await auth.api.getSession({ headers: new Headers({ cookie }), returnHeaders: true })
    expect(result.response?.user).toBeTruthy()
    const refreshed = result.headers.getSetCookie()
    expect(refreshed.length).toBeGreaterThan(0)
    expect(refreshed[0]).toMatch(/^better-auth\.session_token=/)
  })

  it("退出当前设备只结束本设备，另一台设备的会话仍然有效", async () => {
    const { auth, sms } = build()
    const first = await login(auth, sms)
    const second = await login(auth, sms)

    const signOut = await auth.api.signOut({ headers: new Headers({ cookie: first.cookie }), returnHeaders: true })
    expect(signOut.headers.getSetCookie().some((value) => value.includes("Max-Age=0"))).toBe(true)

    const firstSession = await auth.api.getSession({ headers: new Headers({ cookie: first.cookie }) })
    const secondSession = await auth.api.getSession({ headers: new Headers({ cookie: second.cookie }) })
    expect(firstSession).toBeNull()
    expect(secondSession?.user.id).toBe(second.accountId)
  })

  it("退出所有设备会撤销该账号的全部会话", async () => {
    const { auth, sms } = build()
    const first = await login(auth, sms)
    const second = await login(auth, sms)

    await auth.api.revokeSessions({ headers: new Headers({ cookie: second.cookie }) })

    expect(await auth.api.getSession({ headers: new Headers({ cookie: first.cookie }) })).toBeNull()
    expect(await auth.api.getSession({ headers: new Headers({ cookie: second.cookie }) })).toBeNull()
  })

  it("会话过期后读不到会话", async () => {
    const { auth, sms, db } = build()
    const { cookie } = await login(auth, sms)
    for (const session of db.session ?? []) session.expiresAt = new Date(0)
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull()
  })

  it("注册写入的合成邮箱不包含手机号，手机号只落在账号的 phone 字段", async () => {
    const { auth, sms, db } = build()
    await login(auth, sms)
    const user = (db.user ?? [])[0] as { email: string; phoneNumber: string; name: string }
    expect(user.email).toMatch(/^phone-[0-9a-f]{32}@phone\.invalid$/)
    expect(user.email).not.toContain("13800138000")
    expect(user.name).not.toContain("13800138000")
    expect(user.phoneNumber).toBe("+8613800138000")
  })
})
