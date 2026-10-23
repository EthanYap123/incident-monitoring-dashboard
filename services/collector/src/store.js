import { readFile } from 'node:fs/promises';
import pg from 'pg';

// Two interchangeable stores: PostgreSQL for the Docker stack, memory for a quick `npm start`
// without a database. Both return plain objects with millisecond timestamps.

export async function createStore(databaseUrl) {
  if (!databaseUrl) {
    console.warn('[collector] DATABASE_URL not set - using the in-memory store (data is lost on restart)');
    return createMemoryStore();
  }
  return createPostgresStore(databaseUrl);
}

const ms = (d) => (d == null ? null : new Date(d).getTime());
const date = (n) => (n == null ? null : new Date(n));

async function createPostgresStore(connectionString) {
  const pool = new pg.Pool({ connectionString, max: 10 });
  pool.on('error', (err) => console.error('[collector] idle database client error:', err.message));

  // The database may still be starting when the collector boots (outside of Compose health checks).
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch (err) {
      if (attempt >= 30) throw err;
      console.warn(`[collector] waiting for database (${attempt}/30): ${err.message}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  await pool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));

  const toSample = (r) => ({
    ts: ms(r.ts),
    service: r.service,
    cpu: r.cpu,
    memory: r.memory,
    errorRate: r.error_rate,
    latency: r.latency_ms,
    rps: r.rps,
    scenario: r.scenario,
  });
  const toIncident = (r) => ({
    id: r.id,
    seq: r.seq,
    service: r.service,
    metric: r.metric,
    severity: r.severity,
    status: r.status,
    threshold: r.threshold,
    value: r.value,
    peak: r.peak,
    message: r.message,
    openedAt: ms(r.opened_at),
    acknowledgedAt: ms(r.acknowledged_at),
    resolvedAt: ms(r.resolved_at),
    updatedAt: ms(r.updated_at),
  });
  const toDelivery = (r) => ({
    id: Number(r.id),
    event: r.event,
    incidentId: r.incident_id,
    url: r.url,
    statusCode: r.status_code,
    ok: r.ok,
    attempts: r.attempts,
    durationMs: r.duration_ms,
    error: r.error,
    sentAt: ms(r.sent_at),
  });

  return {
    kind: 'postgres',

    async insertSamples(samples) {
      if (samples.length === 0) return;
      const values = [];
      const rows = samples.map((s, i) => {
        values.push(date(s.ts), s.service, s.cpu, s.memory, s.errorRate, s.latency, s.rps, s.scenario ?? 'normal');
        const o = i * 8;
        return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8})`;
      });
      await pool.query(
        `INSERT INTO metric_samples (ts, service, cpu, memory, error_rate, latency_ms, rps, scenario) VALUES ${rows.join(',')}`,
        values,
      );
    },

    async samplesSince(sinceMs) {
      const { rows } = await pool.query('SELECT * FROM metric_samples WHERE ts > $1 ORDER BY ts ASC', [date(sinceMs)]);
      return rows.map(toSample);
    },

    async saveIncident(i) {
      await pool.query(
        `INSERT INTO incidents (id, seq, service, metric, severity, status, threshold, value, peak, message,
                                opened_at, acknowledged_at, resolved_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (id) DO UPDATE SET severity = EXCLUDED.severity, status = EXCLUDED.status,
           threshold = EXCLUDED.threshold, value = EXCLUDED.value, peak = EXCLUDED.peak, message = EXCLUDED.message,
           acknowledged_at = EXCLUDED.acknowledged_at, resolved_at = EXCLUDED.resolved_at, updated_at = EXCLUDED.updated_at`,
        [i.id, i.seq, i.service, i.metric, i.severity, i.status, i.threshold, i.value, i.peak, i.message,
          date(i.openedAt), date(i.acknowledgedAt), date(i.resolvedAt), date(i.updatedAt)],
      );
    },

    async listIncidents(limit = 100) {
      const { rows } = await pool.query('SELECT * FROM incidents ORDER BY opened_at DESC LIMIT $1', [limit]);
      return rows.map(toIncident);
    },

    async unresolvedIncidents() {
      const { rows } = await pool.query("SELECT * FROM incidents WHERE status <> 'resolved'");
      return rows.map(toIncident);
    },

    async maxIncidentSeq() {
      const { rows } = await pool.query('SELECT COALESCE(MAX(seq), 0) AS max FROM incidents');
      return Number(rows[0].max);
    },

    async saveDelivery(d) {
      const { rows } = await pool.query(
        `INSERT INTO webhook_deliveries (event, incident_id, url, status_code, ok, attempts, duration_ms, error, sent_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [d.event, d.incidentId, d.url, d.statusCode, d.ok, d.attempts, d.durationMs, d.error, date(d.sentAt)],
      );
      return toDelivery(rows[0]);
    },

    async listDeliveries(limit = 50) {
      const { rows } = await pool.query('SELECT * FROM webhook_deliveries ORDER BY sent_at DESC, id DESC LIMIT $1', [limit]);
      return rows.map(toDelivery);
    },

    async loadRules() {
      const { rows } = await pool.query('SELECT metric, warning, critical FROM alert_rules');
      return rows;
    },

    async saveRules(rules) {
      for (const r of rules) {
        await pool.query(
          `INSERT INTO alert_rules (metric, warning, critical) VALUES ($1,$2,$3)
           ON CONFLICT (metric) DO UPDATE SET warning = EXCLUDED.warning, critical = EXCLUDED.critical`,
          [r.metric, r.warning, r.critical],
        );
      }
    },

    async prune(olderThanMs) {
      const { rowCount } = await pool.query('DELETE FROM metric_samples WHERE ts < $1', [date(olderThanMs)]);
      return rowCount;
    },

    async ping() {
      await pool.query('SELECT 1');
    },

    close: () => pool.end(),
  };
}

function createMemoryStore() {
  let samples = [];
  const incidents = new Map();
  const deliveries = [];
  let rules = [];
  let deliveryId = 0;

  return {
    kind: 'memory',
    async insertSamples(batch) {
      samples.push(...batch);
    },
    async samplesSince(sinceMs) {
      return samples.filter((s) => s.ts > sinceMs);
    },
    async saveIncident(i) {
      incidents.set(i.id, { ...i });
    },
    async listIncidents(limit = 100) {
      return [...incidents.values()].sort((a, b) => b.openedAt - a.openedAt).slice(0, limit);
    },
    async unresolvedIncidents() {
      return [...incidents.values()].filter((i) => i.status !== 'resolved');
    },
    async maxIncidentSeq() {
      return Math.max(0, ...[...incidents.values()].map((i) => i.seq));
    },
    async saveDelivery(d) {
      const row = { ...d, id: ++deliveryId };
      deliveries.unshift(row);
      deliveries.length = Math.min(deliveries.length, 500);
      return row;
    },
    async listDeliveries(limit = 50) {
      return deliveries.slice(0, limit);
    },
    async loadRules() {
      return rules;
    },
    async saveRules(next) {
      rules = next;
    },
    async prune(olderThanMs) {
      const before = samples.length;
      samples = samples.filter((s) => s.ts >= olderThanMs);
      return before - samples.length;
    },
    async ping() {},
    close: async () => {},
  };
}
