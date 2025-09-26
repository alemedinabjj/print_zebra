FROM node:20-bookworm-slim AS base

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    APP_PORT=9999

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       cups-client \
       libcups2 \
       ghostscript \
       curl \
       ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install --omit=dev && npm cache clean --force

COPY src ./src

EXPOSE 9999


HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:${APP_PORT}/health || exit 1

CMD ["node", "src/server.js"]
