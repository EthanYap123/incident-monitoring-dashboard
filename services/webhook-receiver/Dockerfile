FROM node:22-alpine
WORKDIR /app/services/webhook-receiver

COPY services/webhook-receiver/package.json ./
COPY services/webhook-receiver/src ./src

ENV NODE_ENV=production PORT=4002
EXPOSE 4002
USER node
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4002/healthz || exit 1
CMD ["node", "src/index.js"]
