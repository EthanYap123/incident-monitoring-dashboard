# Build context is the repository root (see docker-compose.yml), so the shared core package is available.
FROM node:22-alpine
WORKDIR /app

COPY packages/core /app/packages/core
COPY services/simulator/package.json services/simulator/package-lock.json /app/services/simulator/
WORKDIR /app/services/simulator
RUN npm ci --omit=dev && npm cache clean --force

COPY services/simulator/src ./src

ENV NODE_ENV=production PORT=4001
EXPOSE 4001
USER node
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4001/healthz || exit 1
CMD ["node", "src/index.js"]
