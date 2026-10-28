export { listMajors, listRecords, searchUnits } from "./api"
export type {
  AdmissionRecord,
  AdmissionUnit,
  Coverage,
  Lookup,
  MajorList,
  RecordList,
  SubjectGroup,
  UnitList,
} from "./api"
export { FAVORITES_STORAGE_KEY, favoriteFromInput, favoritesSchema, readFavorites, writeFavorites } from "./favorites"
export type { AdmissionFavorite } from "./favorites"
