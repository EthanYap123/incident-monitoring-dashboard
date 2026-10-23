# Build context is the repository root (see docker-compose.yml), so the shared core package is available.

# 1. Build the static Next.js export
FROM node:22-alpine AS build
WORKDIR /app
COPY packages/core /app/packages/core
COPY dashboard/package.json dashboard/package-lock.json /app/dashboard/
WORKDIR /app/dashboard
RUN npm ci
COPY dashboard/ ./
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_DATA_MODE=live
RUN npm run build

# 2. Serve it with nginx, which also proxies /api and /ws to the collector
FROM nginx:1.27-alpine
COPY dashboard/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dashboard/out /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1
