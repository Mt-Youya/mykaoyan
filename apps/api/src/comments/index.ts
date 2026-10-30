import { Module } from "@nestjs/common"

import { AuthModule } from "../auth"
import { MembershipModule } from "../membership"
import { AdminCommentsController, CommentsController } from "./controller"
import { CommentsService } from "./service"
@Module({
  imports: [AuthModule, MembershipModule],
  controllers: [CommentsController, AdminCommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
export { CommentsService }
