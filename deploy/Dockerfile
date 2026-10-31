FROM node:24.22.1-bookworm-slim AS build
WORKDIR /workspace
# 与 package.json 的 packageManager 保持一致，避免 pnpm 自切换时未通过锁文件签名校验。
COPY package.json ./
RUN npm install --global "pnpm@$(node -p 'require("./package.json").packageManager.split("@").pop()')"
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build
RUN pnpm --filter @mykaoyan/api deploy --prod --legacy /api
# apps/api 的 tsconfig.json 继承仓库根配置；镜像里没有那条 extends 链。
# 用随包发布的独立 tsconfig 覆盖它，tsx 在 /app 下会按 tsconfig.json 读取装饰器开关。
RUN cp /api/tsconfig.runtime.json /api/tsconfig.json
RUN mkdir -p /web-runtime/node_modules && cp -R -L apps/web/node_modules/zod /web-runtime/node_modules/zod

FROM node:24.22.1-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /api .
USER node
CMD ["node", "--import", "tsx", "src/main.ts"]

FROM node:24.22.1-bookworm-slim AS web
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /workspace/apps/web/.output ./.output
COPY --from=build --chown=node:node /workspace/apps/web/scripts ./scripts
COPY --from=build --chown=node:node /web-runtime/node_modules ./node_modules
USER node
CMD ["node", "scripts/start.mjs"]
