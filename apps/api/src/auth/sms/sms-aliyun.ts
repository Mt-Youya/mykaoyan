import { createHmac, randomUUID } from "node:crypto"
import type { AliyunAuthEnvironment } from "../environment"
import { OTP_CODE_LENGTH, OTP_SEND_COOLDOWN_SECONDS, OTP_TTL_SECONDS, toAliyunPhone } from "../policy"
import { SmsProviderError } from "./sms"
import type { SmsVerifier } from "./sms"

/**
 * 阿里云号码认证服务（Dypnsapi 2017-05-25）的短信验证码实现。
 *
 * - 发送：`SendSmsVerifyCode`，用系统赠送签名与模板，`TemplateParam` 里的 `##code##` 占位符
 *   让阿里云按 `CodeLength`/`CodeType` 生成验证码，本站不接触验证码原文。
 * - 校验：`CheckSmsVerifyCode`，只认 `Model.VerifyResult = PASS`。
 *
 * 接口按阿里云 RPC 风格签名（HMAC-SHA1），不引入 SDK；请求与响应都由注入的 `fetch` 完成，
 * 测试用假 fetch 校验请求形状，不联网。
 */
const API_VERSION = "2017-05-25"

/** RFC 3986 编码：阿里云签名要求 `!'()*` 也被编码。 */
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  )
}

export function canonicalQuery(parameters: Record<string, string>): string {
  return Object.keys(parameters)
    .toSorted()
    .map((key) => `${percentEncode(key)}=${percentEncode(parameters[key] ?? "")}`)
    .join("&")
}

/** RPC 签名：`Base64(HMAC-SHA1(secret + "&", method + "&" + encode("/") + "&" + encode(canonicalQuery)))`。 */
export function signRpcRequest(
  parameters: Record<string, string>,
  method: "GET" | "POST",
  accessKeySecret: string
): string {
  const stringToSign = `${method}&${percentEncode("/")}&${percentEncode(canonicalQuery(parameters))}`
  return createHmac("sha1", `${accessKeySecret}&`).update(stringToSign).digest("base64")
}

type AliyunResponse = {
  Code?: string
  Message?: string
  RequestId?: string
  Model?: { VerifyResult?: string }
}

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string> }
) => Promise<{
  ok: boolean
  status: number
  json(): Promise<unknown>
}>

export class AliyunSmsVerifier implements SmsVerifier {
  constructor(
    private readonly config: AliyunAuthEnvironment,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly now: () => Date = () => new Date(),
    private readonly nonce: () => string = randomUUID
  ) {}

  async sendCode(e164Phone: string): Promise<{ requestId: string }> {
    const result = await this.call("SendSmsVerifyCode", {
      CountryCode: "86",
      PhoneNumber: toAliyunPhone(e164Phone),
      SignName: this.config.signName,
      TemplateCode: this.config.templateCode,
      TemplateParam: this.config.templateParam,
      CodeLength: String(OTP_CODE_LENGTH),
      CodeType: "1",
      ValidTime: String(OTP_TTL_SECONDS),
      DuplicatePolicy: "1",
      Interval: String(OTP_SEND_COOLDOWN_SECONDS),
      ReturnVerifyCode: "false",
    })
    return { requestId: result.RequestId ?? "" }
  }

  async checkCode(e164Phone: string, code: string): Promise<"valid" | "invalid"> {
    const result = await this.call("CheckSmsVerifyCode", {
      CountryCode: "86",
      PhoneNumber: toAliyunPhone(e164Phone),
      VerifyCode: code,
      CaseAuthPolicy: "1",
    })
    return result.Model?.VerifyResult === "PASS" ? "valid" : "invalid"
  }

  private async call(action: string, parameters: Record<string, string>): Promise<AliyunResponse> {
    const common: Record<string, string> = {
      Action: action,
      Version: API_VERSION,
      Format: "JSON",
      AccessKeyId: this.config.accessKeyId,
      SignatureMethod: "HMAC-SHA1",
      SignatureNonce: this.nonce(),
      SignatureVersion: "1.0",
      Timestamp: this.now()
        .toISOString()
        .replace(/\.\d{3}Z$/, "Z"),
    }
    const all = { ...common, ...parameters }
    const signature = signRpcRequest(all, "GET", this.config.accessKeySecret)
    const url = `${this.config.endpoint.replace(/\/$/, "")}/?${canonicalQuery(all)}&Signature=${percentEncode(signature)}`
    const response = await this.fetchImpl(url, { method: "GET", headers: { accept: "application/json" } })
    const body = (await response.json()) as AliyunResponse
    if (!response.ok || body.Code !== "OK") {
      // 只保留阿里云错误码，不把请求 URL（含签名）写进日志或错误信息。
      throw new SmsProviderError(body.Code ?? `HTTP_${response.status}`, "短信服务暂时不可用")
    }
    return body
  }
}
