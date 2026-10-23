# Containerized Incident Monitoring Dashboard

A small observability platform you can run with one command. A telemetry simulator streams CPU, memory, error-rate and latency metrics for four microservices; a collector stores them in PostgreSQL, runs a threshold alerting engine, fires webhooks and pushes everything to a real-time Next.js dashboard over WebSockets. Chaos controls let you inject traffic spikes, server failures and memory leaks, then watch the incidents open, escalate and resolve.

**Live demo:** https://ethanyap123.github.io/incident-monitoring-dashboard/
(GitHub Pages is static hosting, so the demo runs the same simulator and alert engine inside your browser. Run the Docker stack below for the full multi-container version.)

![CI](https://github.com/EthanYap123/incident-monitoring-dashboard/actions/workflows/ci.yml/badge.svg)

## Architecture

```mermaid
flowchart LR
  subgraph compose[docker compose]
    sim[simulator<br/>Node.js :4001] -- POST /api/ingest every 2 s --> col[collector<br/>Express + ws :4000]
    col -- SQL --> db[(PostgreSQL 16)]
    col -- POST incident webhooks<br/>3 attempts + backoff --> hook[webhook-receiver<br/>:4002]
    col -- scenario control --> sim
    dash[dashboard<br/>nginx :8080] -- /api, /ws proxy --> col
  end
  browser((Browser)) -- HTTP + WebSocket --> dash
```

| Container | What it does |
| --- | --- |
| `simulator` | Models four services (API Gateway, Auth, Payments, Orders) with mean-reverting, noisy metrics. Scenarios (spike, failure, leak, recover) pull the metrics towards new targets. Ships a batch to the collector every `TICK_MS`. |
| `collector` | Validates and stores samples, evaluates alert rules, records incidents and webhook deliveries in PostgreSQL, and broadcasts every change over `/ws`. Restores open incidents and saved thresholds after a restart. |
| `db` | PostgreSQL 16: `metric_samples` (time-series, pruned after `RETENTION_MINUTES`), `incidents`, `webhook_deliveries`, `alert_rules`. |
| `webhook-receiver` | A stand-in for Slack / PagerDuty: accepts incident webhooks and keeps the latest 100. `WEBHOOK_FAIL_RATE` makes it reject some, to show retries. |
| `dashboard` | Next.js 16 + Tailwind CSS 4 static export served by nginx, which also proxies `/api` and `/ws` to the collector so the browser only talks to one origin. |

Every container has a health check, and Compose starts them in dependency order (`db` → `webhook-receiver` → `collector` → `simulator` / `dashboard`).

## Run it locally with Docker

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine with the Compose plugin).

```bash
git clone https://github.com/EthanYap123/incident-monitoring-dashboard.git
cd incident-monitoring-dashboard
docker compose up --build
```

Then open **http://localhost:8080**.

| URL | |
| --- | --- |
| http://localhost:8080 | Dashboard |
| http://localhost:4000/healthz | Collector health (also `/api/...` directly) |
| http://localhost:4001/control/scenarios | Simulator state |
| http://localhost:4002/hooks/incidents | Webhooks the receiver has accepted |

Stop with `Ctrl+C`, or `docker compose down` (add `-v` to also delete the database volume). To change ports, credentials or webhook targets, copy `.env.example` to `.env` and edit it.

### Try it

1. In **Chaos controls**, pick *Payments* and press **Server failure**. Within about 4 seconds the error-rate and latency incidents open, a toast appears, the tab title shows the count, and two `incident.opened` webhooks are delivered.
2. Press **Acknowledge** on an incident in the log, and an `incident.acknowledged` webhook goes out.
3. Press **Recover**. The metrics ease back to baseline, and after three clear samples the incidents resolve.
4. Try **Traffic spike** on *All services*, or **Memory leak** and watch memory climb until it alerts.
5. Lower a threshold in **Alert thresholds** and save. The rule is stored in PostgreSQL and every connected dashboard updates.

## How alerting works

Each metric has a warning and a critical threshold (editable from the dashboard):

| Metric | Warning | Critical |
| --- | --- | --- |
| CPU usage | 80 % | 92 % |
| Memory pressure | 85 % | 95 % |
| Error rate | 5 % | 15 % |
| p95 latency | 600 ms | 1500 ms |

- An incident opens after **2 consecutive** samples over the warning threshold, so a single noisy reading does not page anyone.
- It escalates to critical as soon as a reading crosses the critical threshold.
- It resolves after **3 consecutive** samples back under the warning threshold, and a new breach in that window resets the countdown.
- Only one incident per service and metric can be open at a time.
- Opened, escalated, acknowledged and resolved events each send a webhook with up to 3 attempts and a short backoff; every delivery is recorded with its status code, attempts and duration.

A service's health badge is the worst severity among its open incidents, or *Offline* if it has not reported for 10 seconds.

## API

All endpoints are on the collector (`:4000`) and proxied by the dashboard at `/api`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/healthz` | Health, store type and connected WebSocket clients |
| `GET` | `/api/snapshot?minutes=10` | Everything the dashboard needs: samples, incidents, deliveries, rules |
| `GET` | `/api/metrics?minutes=15&service=payments` | Raw samples |
| `GET` | `/api/incidents?status=open&limit=100` | Incident log |
| `POST` | `/api/incidents/:id/acknowledge` | Acknowledge an open incident |
| `GET` / `PUT` | `/api/rules` | Read or update thresholds (`{ "rules": [{ "metric": "cpu", "warning": 80, "critical": 92 }] }`) |
| `GET` | `/api/webhooks` | Webhook delivery history |
| `GET` / `POST` | `/api/scenarios` | Read or set a scenario (`{ "service": "payments" \| "all", "scenario": "spike" \| "failure" \| "leak" \| "recover" \| "normal" }`) |
| `POST` | `/api/ingest` | Used by the simulator: `{ "samples": [...] }` |
| `WS` | `/ws` | Sends a `snapshot` on connect, then `samples`, `incident`, `webhook`, `rules` and `scenarios` messages |

The dashboard uses the WebSocket and reconnects with exponential backoff. If the socket fails three times in a row it falls back to polling `/api/snapshot` every 3 seconds until the socket comes back.

## Development without Docker

Requires Node.js 22.

```bash
# Shared engine tests
cd packages/core && npm test

# Services (each in its own terminal). Without DATABASE_URL the collector uses an in-memory store.
cd services/webhook-receiver && npm start
cd services/collector && npm install && npm start
cd services/simulator && npm install && npm start

# Dashboard against the local collector
cd dashboard && npm install
NEXT_PUBLIC_COLLECTOR_URL=http://localhost:4000 npm run dev
```

Set `DATABASE_URL=postgres://user:pass@localhost:5432/monitoring` to point the collector at your own PostgreSQL. Add `?mode=demo` to the dashboard URL to run it with the in-browser engine instead.

`scripts/smoke-test.mjs` runs an end-to-end check against a running stack (WebSocket stream, failure → incident → webhook → acknowledge → recovery, and rule validation):

```bash
node scripts/smoke-test.mjs http://localhost:8080 http://localhost:4002
```

## CI and deployment

- **CI** (`.github/workflows/ci.yml`) runs the engine's unit tests, builds the dashboard, then builds the whole stack with `docker compose up --wait` and runs the smoke test through the nginx proxy.
- **Pages** (`.github/workflows/pages.yml`) builds the demo export (`npm run build:demo`) and deploys it to GitHub Pages on every push to `main`.

## Project structure

```
packages/core/          Shared simulation, alert engine and health logic (+ node:test unit tests)
services/simulator/     Telemetry generator and scenario control API
services/collector/     Ingest API, PostgreSQL store, alerting, webhooks, WebSocket broadcast
services/webhook-receiver/  Mock on-call endpoint
dashboard/              Next.js + Tailwind dashboard, nginx config, live and demo data sources
scripts/smoke-test.mjs  End-to-end check for a running stack
docker-compose.yml      Orchestration, health checks and dependency order
```

The simulator, collector and dashboard demo mode all import the same `@imd/core` package, so the in-browser demo behaves exactly like the containerised stack.

## License

MIT
