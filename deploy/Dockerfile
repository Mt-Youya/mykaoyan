FROM node:24.22.1-bookworm-slim AS build
WORKDIR /workspace
RUN npm install --global pnpm@12.15.0
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build
RUN pnpm --filter @mykaoyan/api deploy --prod --legacy /api
RUN mkdir -p /web-runtime/node_modules && cp -R -L apps/web/node_modules/zod /web-runtime/node_modules/zod

FROM node:24.22.1-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /api .
USER node
CMD ["node", "dist/main"]

FROM node:24.22.1-bookworm-slim AS web
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /workspace/apps/web/.output ./.output
COPY --from=build --chown=node:node /workspace/apps/web/scripts ./scripts
COPY --from=build --chown=node:node /web-runtime/node_modules ./node_modules
USER node
CMD ["node", "scripts/start.mjs"]
