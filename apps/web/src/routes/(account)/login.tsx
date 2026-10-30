import { createFileRoute } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getRequest, setResponseHeader } from "@tanstack/react-start/server"
import { useEffect, useState } from "react"

import { Button, Input, Label } from "@mykaoyan/ui"

import { PolicyChecks } from "../(legal)/-legal/documents"
import { MemberPanel } from "../../features/membership"
import { loadLoginState, loginSuccessPath, postJson } from "./-auth"
import type { LoginState } from "./-auth"

/**
 * 服务端读取会话与登录策略。
 *
 * 会话在服务端可能被滑动刷新，刷新得到的 `Set-Cookie` 必须原样转回浏览器
 * （pitfalls §3「会话刷新双写」），否则浏览器拿着旧 cookie，刷新后又掉登录。
 */
const fetchLoginState = createServerFn({ method: "GET" }).handler(async (): Promise<LoginState> => {
  const { state, setCookies } = await loadLoginState(getRequest())
  if (setCookies.length > 0) setResponseHeader("set-cookie", setCookies)
  return state
})

export const Route = createFileRoute("/(account)/login")({
  loader: () => fetchLoginState(),
  component: LoginPage,
})

type Step = "phone" | "code" | "signed-in"

export function LoginPage() {
  const { policy, session } = Route.useLoaderData() as LoginState
  const [step, setStep] = useState<Step>(session ? "signed-in" : "phone")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [consented, setConsented] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  async function requestCode() {
    setBusy(true)
    setMessage(null)
    const result = await postJson("/api/phone/request-code", { phone })
    setBusy(false)
    if (!result.ok) {
      setMessage(result.message)
      if (result.retryAfterSeconds) setCooldown(result.retryAfterSeconds)
      return
    }
    setStep("code")
    setCooldown(policy.cooldownSeconds)
  }

  async function verify() {
    setBusy(true)
    setMessage(null)
    const result = await postJson("/api/phone/verify", {
      phone,
      code,
      acceptedPolicyVersion: policy.privacyPolicyVersion,
      acceptedTermsVersion: policy.termsVersion,
    })
    setBusy(false)
    if (!result.ok) {
      setMessage(result.message)
      return
    }
    const destination = loginSuccessPath(window.location.hash)
    // 同一页的锚点跳转不会重新加载会话，需要刷新服务端登录状态。
    if (destination === "/login#membership") window.location.reload()
    else window.location.assign(destination)
  }

  async function signOut(all: boolean) {
    setBusy(true)
    setMessage(null)
    const result = await postJson(all ? "/api/phone/sign-out-all" : "/api/phone/sign-out", {})
    setBusy(false)
    if (!result.ok) {
      setMessage(result.message)
      return
    }
    setStep("phone")
    window.location.assign("/login")
  }

  if (step === "signed-in") {
    return (
      <main className="page-container py-section">
        <div className="mx-auto max-w-120">
          <h1 className="font-serif text-section">已登录</h1>
          <MemberPanel />
          <p className="mt-4 text-muted-foreground">退出默认只结束当前设备；要结束所有设备请用下面的按钮。</p>
          <div className="mt-8 flex flex-col gap-3">
            <Button type="button" className="min-h-11 text-base" onClick={() => signOut(false)} disabled={busy}>
              退出当前设备
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 text-base"
              onClick={() => signOut(true)}
              disabled={busy}
            >
              退出所有设备
            </Button>
          </div>
          {message ? (
            <p role="alert" className="mt-6 border-l-2 border-destructive pl-3 text-destructive">
              {message}
            </p>
          ) : null}
        </div>
      </main>
    )
  }

  return (
    <main className="page-container py-section">
      <div className="mx-auto max-w-120">
        <h1 className="font-serif text-section">手机号登录</h1>
        <p className="mt-4 text-muted-foreground">
          第一次登录即注册。手机号、账号与云端学习数据的数据库地区为 {policy.databaseRegion}
          ，请先阅读下方政策与出境说明。
        </p>
        <form
          className="mt-8 grid gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            if (!policy.loginEnabled || !agreed || !consented) return
            if (step === "phone") void requestCode()
            else void verify()
          }}
        >
          <Label className="flex-col items-stretch gap-2 leading-normal">
            手机号
            <Input
              className="min-h-11 text-base md:text-base"
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={11}
              value={phone}
              placeholder="虚构示例：13800138000"
              onChange={(event) => setPhone(event.target.value.replace(/\D/g, ""))}
              required
            />
          </Label>

          {step === "code" ? (
            <Label className="flex-col items-stretch gap-2 leading-normal">
              验证码
              <Input
                className="min-h-11 text-base md:text-base"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                // 位数来自服务端策略，和短信模板 / 服务端校验同一个来源
                maxLength={policy.codeLength}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                required
              />
            </Label>
          ) : null}

          <PolicyChecks
            policy={policy}
            agreed={agreed}
            consented={consented}
            onAgreement={setAgreed}
            onConsent={setConsented}
          />
          {!policy.loginEnabled ? <p role="alert">数据存储位置尚未确认，暂不能登录；可浏览无需登录的内容。</p> : null}

          <div className="grid gap-3">
            <Button
              type="submit"
              className="min-h-11 text-base"
              disabled={busy || (step === "phone" && cooldown > 0) || !consented || !agreed || !policy.loginEnabled}
            >
              {step === "phone" ? (cooldown > 0 ? `${cooldown} 秒后可重新获取` : "获取验证码") : "登录"}
            </Button>
            {step === "code" ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 text-base"
                disabled={busy || cooldown > 0 || !consented || !agreed || !policy.loginEnabled}
                onClick={() => void requestCode()}
              >
                {cooldown > 0 ? `${cooldown} 秒后可重新获取` : "重新获取验证码"}
              </Button>
            ) : null}
          </div>
        </form>
        {message ? (
          <p role="alert" className="mt-6 border-l-2 border-destructive pl-3 text-destructive">
            {message}
          </p>
        ) : null}
        <p className="mt-6 text-sm text-muted-foreground">验证码 {policy.codeTtlSeconds / 60} 分钟内有效。</p>
      </div>
    </main>
  )
}
