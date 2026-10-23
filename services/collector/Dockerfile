# Build context is the repository root (see docker-compose.yml), so the shared core package is available.
FROM node:22-alpine
WORKDIR /app

COPY packages/core /app/packages/core
COPY services/collector/package.json services/collector/package-lock.json /app/services/collector/
WORKDIR /app/services/collector
RUN npm ci --omit=dev && npm cache clean --force

COPY services/collector/src ./src

ENV NODE_ENV=production PORT=4000
EXPOSE 4000
USER node
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/healthz || exit 1
CMD ["node", "src/index.js"]
