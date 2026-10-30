import { Module } from "@nestjs/common"

import { AuthModule } from "../auth"
import { MembershipModule } from "../membership"
import { PapersController } from "./controller"
import { PapersService } from "./service"

/** 公开试卷与会员/上传者可见答案。 */
@Module({ imports: [AuthModule, MembershipModule], controllers: [PapersController], providers: [PapersService] })
export class PapersModule {}
