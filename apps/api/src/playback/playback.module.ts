import { Module } from "@nestjs/common"
import { AuthModule } from "../auth"
import { CatalogModule } from "../catalog"
import { PlaybackController } from "./controller"
import { PlaybackService } from "./service"

/** 讲的视频播放令牌签发；签发前要确认内容是已上架的讲。 */
@Module({
  imports: [AuthModule, CatalogModule],
  controllers: [PlaybackController],
  providers: [PlaybackService],
  exports: [PlaybackService],
})
export class PlaybackModule {}
