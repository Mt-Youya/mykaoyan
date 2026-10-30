import { useEffect, useRef, useState } from "react"

import { vocabDataSchema } from "@mykaoyan/core"
import type { VocabData } from "@mykaoyan/core"

import { emptyVocabData } from "./model"

export const VOCAB_STORAGE_KEY = "mykaoyan.vocabulary-v1"

function parse(raw: string): VocabData | null {
  try {
    const result = vocabDataSchema.safeParse(JSON.parse(raw))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export function useVocab() {
  const original = useRef<string | null>(null)
  const [data, setData] = useState<VocabData | null>(null)
  const [notice, setNotice] = useState("")
  useEffect(() => {
    try {
      const raw = localStorage.getItem(VOCAB_STORAGE_KEY)
      original.current = raw
      const saved = raw === null ? emptyVocabData : parse(raw)
      setData(saved)
      if (raw !== null && !saved) setNotice("本机词表无法识别，原文件未改动。请从备份恢复，或重新导入自己的词表。")
    } catch {
      setNotice("浏览器存储不可用，暂时无法保存词表。请检查浏览器的存储设置。")
    }
    const sync = (event: StorageEvent) => {
      if (event.key === VOCAB_STORAGE_KEY || event.key === null)
        setNotice("另一个标签页修改了本机词表，请刷新后继续，以免覆盖。")
    }
    window.addEventListener("storage", sync)
    return () => window.removeEventListener("storage", sync)
  }, [])

  function save(next: VocabData) {
    try {
      if (localStorage.getItem(VOCAB_STORAGE_KEY) !== original.current) {
        setNotice("另一个标签页修改了本机词表，请刷新后继续；本次没有覆盖保存。")
        return false
      }
      const checked = vocabDataSchema.parse(next)
      localStorage.setItem(VOCAB_STORAGE_KEY, JSON.stringify(checked))
      original.current = localStorage.getItem(VOCAB_STORAGE_KEY)
      setData(checked)
      setNotice("")
      return true
    } catch {
      setNotice("词表未保存。请检查浏览器存储设置或剩余空间。")
      return false
    }
  }
  return { data, notice, save }
}
