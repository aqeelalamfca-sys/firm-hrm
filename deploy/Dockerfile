FROM node:24-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/db/package.json lib/db/
COPY lib/api-spec/package.json lib/api-spec/
COPY lib/api-zod/package.json lib/api-zod/
COPY lib/api-client-react/package.json lib/api-client-react/
COPY lib/integrations-openai-ai-server/package.json lib/integrations-openai-ai-server/
COPY artifacts/api-server/package.json artifacts/api-server/
COPY artifacts/hrm-system/package.json artifacts/hrm-system/
RUN pnpm install --no-frozen-lockfile --prod=false

FROM deps AS builder
COPY . .
ENV NODE_ENV=production
ENV PORT=5000
ENV BASE_PATH=/
RUN pnpm --filter @workspace/api-server run build
RUN pnpm --filter @workspace/hrm-system run build

FROM node:24-slim AS production
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/artifacts/api-server/node_modules ./artifacts/api-server/node_modules
COPY --from=builder /app/artifacts/api-server/dist ./dist
COPY --from=builder /app/artifacts/hrm-system/dist/public ./dist/public
COPY --from=builder /app/package.json ./
RUN pnpm add pdfkit@0.16.0 --dir /app 2>/dev/null || npm install --no-save pdfkit@0.16.0

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:5000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
