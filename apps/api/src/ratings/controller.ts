import { Body, Controller, Get, Header, Inject, Param, Put, UseGuards } from "@nestjs/common"
import { CurrentSession, SessionGuard } from "../auth"
import type { AuthSession } from "../auth"
import { RatingsService } from "./service"
@Controller("submissions/:id/rating")
@UseGuards(SessionGuard)
export class RatingsController {
  constructor(@Inject(RatingsService) private ratings: RatingsService) {}
  @Get() @Header("Cache-Control", "no-store") mine(@CurrentSession() s: AuthSession, @Param("id") id: string) {
    return this.ratings.mine(s.user.id, id)
  }
  @Put() @Header("Cache-Control", "no-store") put(
    @CurrentSession() s: AuthSession,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    return this.ratings.put(s.user.id, id, body)
  }
}
