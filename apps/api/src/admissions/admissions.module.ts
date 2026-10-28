import { Module } from "@nestjs/common"
import { AdmissionsController } from "./controller"
import { ChsiClient } from "./client"
import { AdmissionsService, CHSI_CLIENT } from "./service"

/** 研招网硕士专业目录的服务端查询；上游请求与原始响应只留在服务端。 */
@Module({
  controllers: [AdmissionsController],
  providers: [
    AdmissionsService,
    { provide: CHSI_CLIENT, useFactory: () => new ChsiClient({ fetch: globalThis.fetch.bind(globalThis) }) },
  ],
})
export class AdmissionsModule {}
