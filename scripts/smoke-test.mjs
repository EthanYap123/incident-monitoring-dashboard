// End-to-end check of a running stack: WebSocket stream, scenario control, alerting, webhooks, recovery.
// Usage: node scripts/smoke-test.mjs [baseUrl] [webhookReceiverUrl]
//   docker compose:  node scripts/smoke-test.mjs http://localhost:8080 http://localhost:4002

const BASE = (process.argv[2] ?? 'http://localhost:8080').replace(/\/$/, '');
const RECEIVER = (process.argv[3] ?? 'http://localhost:4002').replace(/\/$/, '');
const TARGET = 'payments';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, { headers: { 'content-type': 'application/json' }, ...options });
  const body = await res.json();
  if (!res.ok) throw new Error(`${options.method ?? 'GET'} ${path} -> ${res.status} ${JSON.stringify(body)}`);
  return body;
}

async function waitFor(label, check, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) {
      console.log(`  ok  ${label}`);
      return result;
    }
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

const step = (title) => console.log(`\n${title}`);

try {
  step('1. Stack is up');
  await waitFor('dashboard and collector respond', async () => {
    try {
      const snap = await api('/api/snapshot');
      return snap.samples.length > 0 && snap;
    } catch {
      return false;
    }
  }, 90_000);

  step('2. WebSocket streams live samples');
  const wsUrl = `${BASE.replace(/^http/, 'ws')}/ws`;
  const messages = [];
  const socket = new WebSocket(wsUrl);
  socket.onmessage = (e) => messages.push(JSON.parse(e.data));
  await waitFor('snapshot received on connect', () => messages.some((m) => m.type === 'snapshot'));
  await waitFor('samples pushed', () => messages.some((m) => m.type === 'samples'));

  step(`3. Server failure on ${TARGET} raises critical incidents`);
  await api('/api/scenarios', { method: 'POST', body: JSON.stringify({ service: TARGET, scenario: 'failure' }) });
  const opened = await waitFor('critical incident opened', async () => {
    const { incidents } = await api('/api/incidents?status=open');
    return incidents.find((i) => i.service === TARGET && i.severity === 'critical');
  });
  await waitFor('incident event pushed over WebSocket', () =>
    messages.some((m) => m.type === 'incident' && m.incident.id === opened.id));

  step('4. Webhook delivered to the receiver');
  await waitFor('receiver got incident.opened', async () => {
    const res = await fetch(`${RECEIVER}/hooks/incidents`);
    const { received } = await res.json();
    return received.some((r) => r.event === 'incident.opened' && r.incident.id === opened.id);
  });
  await waitFor('delivery recorded by collector', async () => {
    const { deliveries } = await api('/api/webhooks');
    return deliveries.some((d) => d.incidentId === opened.id && d.ok);
  });

  step('5. Acknowledge');
  const { incident: acked } = await api(`/api/incidents/${opened.id}/acknowledge`, { method: 'POST' });
  if (acked.status !== 'acknowledged') throw new Error(`Expected acknowledged, got ${acked.status}`);
  console.log(`  ok  ${opened.id} acknowledged`);

  step('6. Recovery resolves everything');
  await api('/api/scenarios', { method: 'POST', body: JSON.stringify({ service: TARGET, scenario: 'recover' }) });
  await waitFor('no open incidents left for the service', async () => {
    const { incidents } = await api('/api/incidents');
    return incidents.filter((i) => i.service === TARGET).every((i) => i.status === 'resolved');
  }, 90_000);

  step('7. Threshold validation');
  const bad = await fetch(`${BASE}/api/rules`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rules: [{ metric: 'cpu', warning: 90, critical: 50 }] }),
  });
  if (bad.status !== 400) throw new Error(`Invalid rules should be rejected, got ${bad.status}`);
  console.log('  ok  invalid thresholds rejected with 400');

  socket.close();
  console.log('\nAll smoke checks passed.');
  process.exit(0);
} catch (err) {
  console.error(`\nSmoke test failed: ${err.message}`);
  process.exit(1);
}
