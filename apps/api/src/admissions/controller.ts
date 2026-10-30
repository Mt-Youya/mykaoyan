import { BadRequestException, Controller, Get, Inject, Param, Query } from "@nestjs/common"
import { z } from "zod"

import { AdmissionsService } from "./service"

const keywordSchema = z.string().trim().min(2).max(30)
const yearSchema = z.coerce.number().int().min(2000).max(2100)
/** 官方五位招生单位代码，例如 10001。 */
const unitCodeSchema = z.string().regex(/^\d{5}$/)
/** 六位招生专业代码；交叉学科等自设专业末两位可以是字母，例如 0202J1。 */
const majorCodeSchema = z.string().regex(/^\d{4}[0-9A-Z]{2}$/)
const modeSchema = z.enum(["full_time", "part_time"]).optional()
/** 一级学科或专业学位类别的四位代码，例如 0812、0854。 */
const disciplineSchema = z
  .string()
  .regex(/^\d{4}$/)
  .optional()

function parse<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new BadRequestException(message)
  return result.data
}

/**
 * 招生目录查询：只供本站页面使用，不属于公开契约，也不提供任意地址转发。
 *
 * 返回的是整理后的字段与研招网公开详情页链接，不包含上游内部请求地址与原始响应。
 */
@Controller("admissions")
export class AdmissionsController {
  constructor(@Inject(AdmissionsService) private readonly admissions: AdmissionsService) {}

  @Get("year")
  year() {
    return this.admissions.catalogYear()
  }

  @Get("units")
  units(@Query("keyword") keyword: string | undefined) {
    return this.admissions.searchUnits(parse(keywordSchema, keyword, "keyword 需要 2 到 30 个字"))
  }

  @Get("units/:unit/majors")
  majors(
    @Param("unit") unit: string,
    @Query("year") year: string | undefined,
    @Query("discipline") discipline: string | undefined,
  ) {
    return this.admissions.listMajors(
      parse(yearSchema, year, "year 必须是招生年度"),
      parse(unitCodeSchema, unit, "招生单位代码必须是五位数字"),
      parse(disciplineSchema, discipline, "学科类别代码必须是四位数字，例如 0812、0854"),
    )
  }

  @Get("records")
  records(
    @Query("year") year: string | undefined,
    @Query("unit") unit: string | undefined,
    @Query("major") major: string | undefined,
    @Query("mode") mode: string | undefined,
  ) {
    return this.admissions.listRecords(
      parse(yearSchema, year, "year 必须是招生年度"),
      parse(unitCodeSchema, unit, "招生单位代码必须是五位数字"),
      parse(majorCodeSchema, major, "招生专业代码必须是六位"),
      parse(modeSchema, mode, "mode 只能是 full_time 或 part_time"),
    )
  }
}
