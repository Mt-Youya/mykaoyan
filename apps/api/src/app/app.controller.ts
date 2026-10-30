import { Controller, Get, Inject } from "@nestjs/common"

import { AppService } from "./app.service"

@Controller("health")
export class AppController {
  constructor(@Inject(AppService) private readonly app: AppService) {}

  @Get()
  check() {
    return this.app.check()
  }
}
