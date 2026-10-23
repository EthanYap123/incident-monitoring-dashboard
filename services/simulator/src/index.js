import http from 'node:http';
import { createSimulator, SCENARIOS, SERVICES } from '@imd/core';

const PORT = Number(process.env.PORT ?? 4001);
const COLLECTOR_URL = process.env.COLLECTOR_URL ?? 'http://localhost:4000';
const TICK_MS = Number(process.env.TICK_MS ?? 2000);

const simulator = createSimulator();
let lastShipped = null;
let lastError = null;
let failures = 0;

async function ship() {
  const batch = simulator.tick();
  try {
    const res = await fetch(`${COLLECTOR_URL}/api/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(TICK_MS),
    });
    if (!res.ok) throw new Error(`collector responded ${res.status}`);
    if (failures > 0) console.log(`[simulator] collector reachable again after ${failures} failed ticks`);
    lastShipped = batch.ts;
    lastError = null;
    failures = 0;
  } catch (err) {
    failures += 1;
    lastError = err.message;
    // Log the first failure and then every 15th, so a collector outage does not flood the logs.
    if (failures === 1 || failures % 15 === 0) {
      console.warn(`[simulator] could not ship batch (${failures} in a row): ${err.message}`);
    }
  }
}

setInterval(ship, TICK_MS);

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 10_000) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Body must be JSON'));
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/healthz') {
    return send(res, 200, { status: 'ok', tickMs: TICK_MS, lastShipped, lastError });
  }
  if (req.method === 'GET' && url.pathname === '/control/scenarios') {
    return send(res, 200, { scenarios: simulator.getScenarios(), available: SCENARIOS, services: SERVICES });
  }
  if (req.method === 'POST' && url.pathname === '/control/scenario') {
    try {
      const { service, scenario } = await readJson(req);
      const scenarios = simulator.setScenario(service, scenario);
      console.log(`[simulator] ${service} -> ${scenario}`);
      return send(res, 200, { scenarios });
    } catch (err) {
      return send(res, 400, { error: err.message });
    }
  }
  send(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`[simulator] control API on :${PORT}, shipping to ${COLLECTOR_URL} every ${TICK_MS}ms`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
