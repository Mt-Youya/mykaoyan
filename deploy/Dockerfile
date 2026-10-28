FROM node:24.22.1-bookworm-slim AS build
WORKDIR /workspace
RUN npm install --global pnpm@12.15.0
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
