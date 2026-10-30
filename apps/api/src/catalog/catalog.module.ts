import { Module } from "@nestjs/common"

import { CatalogController } from "./controller"
import { CATALOG_READER, CatalogService } from "./service"

/** 课程、章、讲、讲义的公开只读接口。 */
@Module({
  controllers: [CatalogController],
  providers: [CatalogService, { provide: CATALOG_READER, useExisting: CatalogService }],
  exports: [CatalogService],
})
export class CatalogModule {}
