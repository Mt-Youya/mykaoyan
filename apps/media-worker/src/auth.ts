import { z } from "zod"

const claimsSchema = z
  .object({
    v: z.literal(1),
    key: z.string().min(1).max(1024),
    subject: z.string().min(1).max(200),
    iat: z.number().int().nonnegative(),
    exp: z.number().int().nonnegative(),
  })
  .strict()

function decode(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("令牌编码无效")
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/"))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export async function verifyToken(token: string | null, secret: string, key: string): Promise<boolean> {
  try {
    if (!token || token.length > 2048) return false
    const parts = token.split(".")
    if (parts.length !== 2) return false
    const [payload, signature] = parts as [string, string]
    const claims = claimsSchema.parse(JSON.parse(new TextDecoder().decode(decode(payload))))
    const now = Math.floor(Date.now() / 1000)
    if (
      claims.key !== key ||
      claims.exp <= now ||
      claims.iat > now ||
      claims.exp <= claims.iat ||
      claims.exp - claims.iat > 3600
    )
      return false
    const hmac = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    )
    return await crypto.subtle.verify("HMAC", hmac, decode(signature), new TextEncoder().encode(payload))
  } catch {
    return false
  }
}
