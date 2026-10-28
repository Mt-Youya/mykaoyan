import { Module } from "@nestjs/common"
import { AuthModule } from "../auth"
import { ProgressController } from "./controller"
import { ProgressService } from "./service"

/** 备考档案、考点、错题、每日记录等同一份私有进度文档的接口。 */
@Module({ imports: [AuthModule], controllers: [ProgressController], providers: [ProgressService] })
export class ProgressModule {}
