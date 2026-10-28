import { Module } from "@nestjs/common"
import { AuthController } from "./auth.controller"
import { PhoneController } from "./phone"
import { authProviders } from "./providers"
import { PhoneAuthService } from "./phone"
import { SessionGuard } from "./session"
import { AUTH } from "./tokens"

/** 手机号验证码登录、会话守卫与 Agent 会话能力。 */
@Module({
  controllers: [AuthController, PhoneController],
  providers: [...authProviders],
  exports: [AUTH, PhoneAuthService, SessionGuard],
})
export class AuthModule {}
