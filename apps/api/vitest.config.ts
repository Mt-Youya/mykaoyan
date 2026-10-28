import { defineConfig } from "vitest/config"

/**
 * 集成测试共用一个 `mykaoyan_test` 临时库：文件之间必须串行，否则一个文件清表会打断另一个文件。
 */
export default defineConfig({
  test: {
    fileParallelism: false,
  },
})
