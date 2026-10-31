import { Module } from "@nestjs/common"

import { AuthModule } from "../auth"
import { MembershipModule } from "../membership"
import { AdminPapersController } from "./admin-controller"
import { PapersController } from "./controller"
import { PaperModerationService } from "./moderation.service"
import { PapersService } from "./service"
import { UserPapersService } from "./user-papers.service"

/** 公开试卷、会员/上传者可见答案，以及用户试卷提交与管理员审核。 */
@Module({
  imports: [AuthModule, MembershipModule],
  controllers: [PapersController, AdminPapersController],
  providers: [PapersService, UserPapersService, PaperModerationService],
})
export class PapersModule {}
