import { z } from "zod"
import type { AdmissionRecord } from "./api"

const codeNameSchema = z.object({ code: z.string(), name: z.string().nullable() })
const groupSchema = z.object({ subjects: z.array(codeNameSchema) })
const favoriteSchema = z.object({
  id: z.string().min(1),
  year: z.number().int(),
  checkedAt: z.string(),
  unit: codeNameSchema,
  college: codeNameSchema,
  major: codeNameSchema,
  direction: codeNameSchema,
  mode: z.enum(["full_time", "part_time"]).nullable(),
  groups: z.array(groupSchema),
  sourceUrl: z.string().nullable(),
})
export const favoritesSchema = z.array(favoriteSchema)
export type AdmissionFavorite = z.infer<typeof favoriteSchema>
export const FAVORITES_STORAGE_KEY = "mykaoyan.admission-favorites-v1"

export function favoriteFromInput(year: number, record: AdmissionRecord, checkedAt: string): AdmissionFavorite {
  return { year, checkedAt, ...record }
}

export function readFavorites(storage: Pick<Storage, "getItem">): AdmissionFavorite[] {
  const raw = storage.getItem(FAVORITES_STORAGE_KEY)
  return raw === null ? [] : favoritesSchema.parse(JSON.parse(raw))
}

export function writeFavorites(storage: Pick<Storage, "setItem">, favorites: AdmissionFavorite[]) {
  storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoritesSchema.parse(favorites)))
}
