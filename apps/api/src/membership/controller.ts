import { Body, Controller, Get, Inject, Post, Query, UseGuards } from "@nestjs/common"

import { CurrentSession, SessionGuard } from "../auth"
import type { AuthSession } from "../auth"
import { MembershipService } from "./service"
@Controller("membership")
@UseGuards(SessionGuard)
export class MembershipController {
  constructor(@Inject(MembershipService) private membership: MembershipService) {}
  @Get() status(@CurrentSession() session: AuthSession) {
    return this.membership.status(session.user.id)
  }
  @Post("redeem") redeem(@CurrentSession() session: AuthSession, @Body() body: unknown) {
    return this.membership.redeem(session.user.id, body)
  }
}
@Controller("admin/membership")
@UseGuards(SessionGuard)
export class AdminMembershipController {
  constructor(@Inject(MembershipService) private membership: MembershipService) {}
  @Post("accounts") find(@CurrentSession() session: AuthSession, @Body() body: unknown) {
    return this.membership.findAccount(session.user, body)
  }
  @Post("grants") grant(@CurrentSession() session: AuthSession, @Body() body: unknown) {
    return this.membership.grant(session.user, body)
  }
  @Post("codes") generate(@CurrentSession() session: AuthSession, @Body() body: unknown) {
    return this.membership.generate(session.user, body)
  }
  @Get("codes") list(@CurrentSession() session: AuthSession, @Query("page") page = "0") {
    return this.membership.listCodes(session.user, Number(page))
  }
}
