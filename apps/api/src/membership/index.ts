import { Module } from "@nestjs/common"

import { AuthModule } from "../auth"
import { AdminMembershipController, MembershipController } from "./controller"
import { MembershipService } from "./service"
@Module({
  imports: [AuthModule],
  controllers: [MembershipController, AdminMembershipController],
  providers: [MembershipService],
  exports: [MembershipService],
})
export class MembershipModule {}
export { MembershipService }
