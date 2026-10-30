import { createHmac } from "node:crypto"

export const key = "fixture/sample.mp4"
export const secret = "unit-test-only-".repeat(3)

export function token(overrides = {}) {
  const now = Math.floor(Date.now() / 1000)
  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      key,
      subject: "fictional-visitor",
      iat: now,
      exp: now + 300,
      ...overrides,
    }),
  ).toString("base64url")
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`
}
