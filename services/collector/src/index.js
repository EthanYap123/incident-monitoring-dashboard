import http from 'node:http';
import express from 'express';
import { WebSocketServer } from 'ws';
import { createAlertEngine, DEFAULT_RULES, SCENARIOS, SERVICES, METRIC_KEYS } from '@imd/core';
import { createStore } from './store.js';
import { createWebhookDispatcher } from './webhooks.js';

const PORT = Number(process.env.PORT ?? 4000);
const SIMULATOR_URL = process.env.SIMULATOR_URL ?? 'http://localhost:4001';
const WEBHOOK_URLS = (process.env.WEBHOOK_URLS ?? 'http://localhost:4002/hooks/incidents')
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean);
const RETENTION_MINUTES = Number(process.env.RETENTION_MINUTES ?? 60);
const HISTORY_MINUTES = 10;

const store = await createStore(process.env.DATABASE_URL);

// Rules saved from the dashboard win over the defaults.
const savedRules = await store.loadRules();
const engine = createAlertEngine({
  rules: DEFAULT_RULES.map((r) => savedRules.find((s) => s.metric === r.metric) ?? r),
  nextSeq: (await store.maxIncidentSeq()) + 1,
});
engine.restore(await store.unresolvedIncidents());

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  // Lets the Next.js dev server (another origin) call the API during development.
  res.set('access-control-allow-origin', '*');
  res.set('access-control-allow-headers', 'content-type');
  res.set('access-control-allow-methods', 'GET,POST,PUT,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(message) {
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(data);
  }
}

const webhooks = createWebhookDispatcher({
  urls: WEBHOOK_URLS,
  store,
  onDelivery: (delivery) => broadcast({ type: 'webhook', delivery }),
});

async function snapshot(minutes = HISTORY_MINUTES) {
  const [samples, incidents, deliveries] = await Promise.all([
    store.samplesSince(Date.now() - minutes * 60_000),
    store.listIncidents(100),
    store.listDeliveries(50),
  ]);
  return {
    serverTime: Date.now(),
    services: SERVICES,
    scenarioCatalog: SCENARIOS,
    rules: engine.getRules(),
    samples,
    incidents,
    deliveries,
    webhookUrls: WEBHOOK_URLS,
    store: store.kind,
  };
}

function validSample(s) {
  return (
    s &&
    SERVICES.some((svc) => svc.id === s.service) &&
    Number.isFinite(s.ts) &&
    [...METRIC_KEYS, 'rps'].every((k) => Number.isFinite(s[k]))
  );
}

// Errors from async handlers end up here instead of crashing the process.
const route = (fn) => (req, res, next) => fn(req, res).catch(next);

app.get('/healthz', route(async (req, res) => {
  await store.ping();
  res.json({ status: 'ok', store: store.kind, clients: wss.clients.size, uptime: Math.round(process.uptime()) });
}));

app.post('/api/ingest', route(async (req, res) => {
  const samples = Array.isArray(req.body?.samples) ? req.body.samples : [];
  if (samples.length === 0 || !samples.every(validSample)) {
    return res.status(400).json({ error: 'Expected { samples: [...] } with numeric metrics for known services' });
  }
  await store.insertSamples(samples);
  broadcast({ type: 'samples', samples });

  for (const event of engine.evaluate(samples, Math.max(...samples.map((s) => s.ts)))) {
    await store.saveIncident(event.incident);
    broadcast({ type: 'incident', event: event.type, incident: event.incident });
    if (event.type !== 'updated') webhooks.dispatch(event.type, event.incident);
  }
  res.status(202).json({ accepted: samples.length });
}));

app.get('/api/snapshot', route(async (req, res) => {
  const minutes = Math.min(Number(req.query.minutes) || HISTORY_MINUTES, RETENTION_MINUTES);
  res.json(await snapshot(minutes));
}));

app.get('/api/metrics', route(async (req, res) => {
  const minutes = Math.min(Number(req.query.minutes) || 15, RETENTION_MINUTES);
  const samples = await store.samplesSince(Date.now() - minutes * 60_000);
  const service = req.query.service;
  res.json({ samples: service ? samples.filter((s) => s.service === service) : samples });
}));

app.get('/api/incidents', route(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  let incidents = await store.listIncidents(limit);
  if (req.query.status) incidents = incidents.filter((i) => i.status === req.query.status);
  res.json({ incidents });
}));

app.post('/api/incidents/:id/acknowledge', route(async (req, res) => {
  const incident = engine.acknowledge(req.params.id);
  if (!incident) return res.status(404).json({ error: 'No open incident with that id' });
  await store.saveIncident(incident);
  broadcast({ type: 'incident', event: 'acknowledged', incident });
  webhooks.dispatch('acknowledged', incident);
  res.json({ incident });
}));

app.get('/api/rules', (req, res) => res.json({ rules: engine.getRules() }));

app.put('/api/rules', route(async (req, res) => {
  const rules = Array.isArray(req.body?.rules) ? req.body.rules.map((r) => ({
    metric: r.metric,
    warning: Number(r.warning),
    critical: Number(r.critical),
  })) : null;
  if (!rules) return res.status(400).json({ error: 'Expected { rules: [...] }' });
  let next;
  try {
    next = engine.setRules(rules);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  await store.saveRules(next);
  broadcast({ type: 'rules', rules: next });
  res.json({ rules: next });
}));

app.get('/api/webhooks', route(async (req, res) => {
  res.json({ urls: WEBHOOK_URLS, deliveries: await store.listDeliveries(Math.min(Number(req.query.limit) || 50, 200)) });
}));

// Scenario controls are forwarded to the simulator so the browser only ever talks to the collector.
app.get('/api/scenarios', route(async (req, res) => {
  const upstream = await fetch(`${SIMULATOR_URL}/control/scenarios`, { signal: AbortSignal.timeout(3000) });
  res.status(upstream.status).json(await upstream.json());
}));

app.post('/api/scenarios', route(async (req, res) => {
  const { service, scenario } = req.body ?? {};
  let upstream;
  try {
    upstream = await fetch(`${SIMULATOR_URL}/control/scenario`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ service, scenario }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (err) {
    return res.status(502).json({ error: `Simulator unreachable: ${err.message}` });
  }
  const body = await upstream.json();
  if (upstream.ok) broadcast({ type: 'scenarios', scenarios: body.scenarios });
  res.status(upstream.status).json(body);
}));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if ((err.status ?? 500) >= 500) console.error('[collector]', err);
  res.status(err.status ?? 500).json({ error: err.expose ? err.message : 'Internal error' });
});

wss.on('connection', async (socket) => {
  socket.isAlive = true;
  socket.on('pong', () => (socket.isAlive = true));
  try {
    socket.send(JSON.stringify({ type: 'snapshot', snapshot: await snapshot() }));
  } catch (err) {
    console.error('[collector] could not send snapshot:', err.message);
  }
});

// Drop dead connections so the client count stays honest.
const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (!socket.isAlive) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 25_000);

const pruner = setInterval(() => {
  store.prune(Date.now() - RETENTION_MINUTES * 60_000).catch((err) => console.error('[collector] prune failed:', err.message));
}, 60_000);

server.listen(PORT, () => {
  console.log(`[collector] listening on :${PORT} (store: ${store.kind}, webhooks: ${WEBHOOK_URLS.join(', ') || 'none'})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    clearInterval(heartbeat);
    clearInterval(pruner);
    for (const socket of wss.clients) socket.terminate();
    wss.close();
    server.close(async () => {
      await store.close();
      process.exit(0);
    });
  });
}
