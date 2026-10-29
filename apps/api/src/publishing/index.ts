import { Module } from "@nestjs/common"
import { AgentTokensModule } from "../agent-tokens"
import { PublishingController } from "./controller"
import { PublisherGuard } from "./guard"
import { PublishingService } from "./service"
import { PUBLISH_STORAGE, R2PublishStorage } from "./storage"
@Module({
  imports: [AgentTokensModule],
  controllers: [PublishingController],
  providers: [PublishingService, PublisherGuard, { provide: PUBLISH_STORAGE, useClass: R2PublishStorage }],
})
export class PublishingModule {}
export { PublishingService, PUBLISH_STORAGE }
export type { PublishStorage } from "./storage"
