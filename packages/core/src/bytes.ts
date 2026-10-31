/**
 * 按 UTF-8 编码计算字符串字节数。
 *
 * 不依赖 TextEncoder，浏览器、NestJS 与测试环境结果一致；孤立代理项按替换字符的 3 字节计算。
 * 与 Postgres `octet_length()` 对合法 UTF-8 文本的口径一致。
 */
export function utf8ByteLength(value: string): number {
  let bytes = 0
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
  }
  return bytes
}
