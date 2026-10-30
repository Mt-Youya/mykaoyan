/** 字面匹配，大小写和兼容字符统一，不执行管理员输入的正则表达式。 */
export function normalizeKeywords(words: readonly string[]): string[] {
  return [...new Set(words.map((word) => word.normalize("NFKC").trim().toLowerCase()).filter(Boolean))]
}
export function blockedComment(body: string, keywords: readonly string[]): boolean {
  const normalized = body.normalize("NFKC").toLowerCase()
  return normalizeKeywords(keywords).some((word) => normalized.includes(word))
}
