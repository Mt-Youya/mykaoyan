import { Module } from "@nestjs/common"

import { AuthModule } from "../auth"
import { ListingController } from "./controller"
import { ListingService } from "./listing.service"

/** 管理员上下架：操作留记录，权限在服务层判断。 */
@Module({ imports: [AuthModule], controllers: [ListingController], providers: [ListingService] })
export class AdminModule {}
