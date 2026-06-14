FROM node:20-bookworm-slim AS builder

RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN NODE_ENV=development npm ci --no-fund --no-audit

COPY . .

RUN ./node_modules/.bin/vite build && \
    ./node_modules/.bin/esbuild server/index.ts \
      --platform=node \
      --packages=external \
      --bundle \
      --format=esm \
      --outdir=dist

FROM node:20-bookworm-slim AS production

RUN apt-get update && apt-get install -y \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN NODE_ENV=production npm ci --omit=dev --no-fund --no-audit

COPY --from=builder /app/dist ./dist
COPY scripts ./scripts

EXPOSE 5000

CMD ["sh", "-c", "node scripts/migrate.mjs && node dist/index.js"]
