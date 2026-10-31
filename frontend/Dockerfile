# ---------- Stage 1: 依赖安装 ----------
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
# 国内云服务器走 npmmirror，避免海外源超时
RUN npm config set registry https://registry.npmmirror.com && npm ci

# ---------- Stage 2: 构建 ----------
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# rewrites 的目标地址会在构建期写入 routes-manifest，因此这里必须传入
ARG BACKEND_URL=http://backend:8080
ENV BACKEND_URL=$BACKEND_URL

RUN npm run build

# ---------- Stage 3: 运行 ----------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3001 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3001

CMD ["node", "server.js"]
