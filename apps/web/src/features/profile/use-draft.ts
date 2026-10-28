import { useEffect, useRef, useState } from "react"
import { parseDraft, STORAGE_KEY, writeDraft } from "./draft"
import type { StudyDraft } from "./draft"

export function useStudyDraft() {
  const original = useRef<string | null>(null)
  const [draft, setDraft] = useState<StudyDraft | null>(null)
  const [ready, setReady] = useState(false)
  const [notice, setNotice] = useState("")
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      original.current = raw
      const saved = raw === null ? null : parseDraft(raw)
      setDraft(saved)
      if (raw !== null && !saved) setNotice("本机草稿无法识别，原文件未改动。请重新设置；保存后才会替换旧草稿。")
    } catch {
      setNotice("浏览器存储不可用，暂时无法保存备考草稿。请检查浏览器的存储设置。")
    }
    setReady(true)
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        setNotice("另一个标签页修改了本机草稿，请刷新后继续，以免覆盖。")
      }
    }
    window.addEventListener("storage", sync)
    return () => window.removeEventListener("storage", sync)
  }, [])
  function save(next: StudyDraft) {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== original.current) {
        setNotice("另一个标签页修改了本机草稿，请刷新后继续；本次没有覆盖保存。")
        return false
      }
      writeDraft(localStorage, next)
      original.current = localStorage.getItem(STORAGE_KEY)
      setDraft(parseDraft(original.current!))
      setNotice("")
      return true
    } catch {
      setNotice("草稿未保存。请检查浏览器存储设置或剩余空间；你的选择仍留在表单中。")
      return false
    }
  }
  return { draft, ready, notice, save }
}
