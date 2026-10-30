import { Controller, Get, Inject, Module, ServiceUnavailableException } from "@nestjs/common"

import { AuthModule } from "../auth"
import { CONFIG } from "../config"
import type { Environment } from "../environment"
import { MembershipModule } from "../membership"
import { PlaybackModule } from "../playback"
import { RatingsModule } from "../ratings"
import { SubmissionAccess } from "./access"
import { AdminSubmissionsController, SubmissionsController } from "./controller"
import { SubmissionModeration } from "./moderation"
import { SubmissionsService } from "./service"
import { R2SubmissionStorage, SUBMISSION_STORAGE } from "./storage"
import { SubmissionUploads } from "./uploads"
export { SUBMISSION_STORAGE } from "./storage"
export type { SubmissionStorage, UploadedPart } from "./storage"
@Module({
  imports: [AuthModule, MembershipModule, PlaybackModule, RatingsModule],
  controllers: [SubmissionsController, AdminSubmissionsController],
  providers: [
    SubmissionAccess,
    SubmissionModeration,
    SubmissionsService,
    SubmissionUploads,
    { provide: SUBMISSION_STORAGE, useClass: R2SubmissionStorage },
  ],
})
export class SubmissionsModule {}
@Controller("submissions")
class EmptySubmissionsController {
  constructor(@Inject(CONFIG) private config: Environment) {}
  @Get() list() {
    if (this.config.COMMUNITY_ENABLED) throw new ServiceUnavailableException("投稿暂不可用")
    return { enabled: false, items: [], hasMore: false }
  }
}
@Module({ controllers: [EmptySubmissionsController] })
export class SubmissionsEmptyModule {}
