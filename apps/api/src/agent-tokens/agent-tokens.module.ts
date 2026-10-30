import { Module } from "@nestjs/common"

import { AuthModule } from "../auth"
import { AgentTokensController } from "./controller"
import { AgentTokenGuard } from "./guard"
import { AgentTokensService } from "./service"

/** Agent 令牌：考生生成/查看/吊销令牌，`/api/v1/*` 用 Bearer 访问。 */
@Module({
  imports: [AuthModule],
  controllers: [AgentTokensController],
  providers: [AgentTokensService, AgentTokenGuard],
  exports: [AgentTokensService, AgentTokenGuard],
})
export class AgentTokensModule {}
