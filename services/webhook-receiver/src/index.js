import http from 'node:http';

// Stands in for Slack / PagerDuty / Opsgenie. FAIL_RATE (0..1) makes it reject some deliveries
// so the collector's retry logic can be seen working.
const PORT = Number(process.env.PORT ?? 4002);
const FAIL_RATE = Number(process.env.FAIL_RATE ?? 0);
const KEEP = 100;

const received = [];

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/healthz') {
    return send(res, 200, { status: 'ok', received: received.length });
  }
  if (req.method === 'GET' && url.pathname === '/hooks/incidents') {
    return send(res, 200, { received });
  }
  if (req.method === 'POST' && url.pathname === '/hooks/incidents') {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      if (Math.random() < FAIL_RATE) return send(res, 503, { error: 'Simulated outage' });
      try {
        const body = JSON.parse(raw);
        received.unshift({ receivedAt: new Date().toISOString(), ...body });
        received.length = Math.min(received.length, KEEP);
        console.log(`[webhook] ${body.event} ${body.incident?.id} ${body.incident?.severity} - ${body.incident?.message}`);
        send(res, 202, { accepted: true });
      } catch {
        send(res, 400, { error: 'Body must be JSON' });
      }
    });
    return;
  }
  send(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => console.log(`[webhook] listening on :${PORT} (fail rate ${FAIL_RATE})`));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
