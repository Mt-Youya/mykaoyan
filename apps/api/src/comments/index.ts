import { Module } from "@nestjs/common"

import { AuthModule } from "../auth"
import { MembershipModule } from "../membership"
import { AdminCommentsController, CommentsController } from "./controller"
import { AdminPaperCommentsController, PaperCommentsController } from "./paper-controller"
import { PaperCommentsService } from "./paper-service"
import { CommentsService } from "./service"
import { AdminSubmissionCommentsController, SubmissionCommentsController } from "./submission-controller"
import { SubmissionCommentsService } from "./submission-service"
@Module({
  imports: [AuthModule, MembershipModule],
  controllers: [
    CommentsController,
    AdminCommentsController,
    SubmissionCommentsController,
    AdminSubmissionCommentsController,
    PaperCommentsController,
    AdminPaperCommentsController,
  ],
  providers: [CommentsService, SubmissionCommentsService, PaperCommentsService],
})
export class CommentsModule {}
export { CommentsService }
