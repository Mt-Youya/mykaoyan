import { Module } from "@nestjs/common"

import { AuthModule } from "../auth"
import { MembershipModule } from "../membership"
import { RatingsController } from "./controller"
import { RatingsService } from "./service"
export { RatingsService } from "./service"
@Module({
  imports: [AuthModule, MembershipModule],
  controllers: [RatingsController],
  providers: [RatingsService],
  exports: [RatingsService],
})
export class RatingsModule {}
