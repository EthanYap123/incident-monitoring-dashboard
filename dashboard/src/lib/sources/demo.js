import {
  createAlertEngine,
  createSimulator,
  DEFAULT_RULES,
  SCENARIOS,
  SERVICES,
} from '@imd/core';

// Runs the same simulator and alert engine as the backend, entirely in the browser, so the
// dashboard works on static hosting. It speaks the same message format as the live source.

const TICK_MS = 2000;
const HISTORY_MS = 10 * 60_000;
const DEMO_WEBHOOK = 'https://hooks.example.com/incidents';

export function createDemoSource() {
  const simulator = createSimulator();
  const engine = createAlertEngine({ rules: DEFAULT_RULES });
  const incidents = new Map();
  const deliveries = [];
  let samples = [];
  let deliveryId = 0;
  let emit = () => {};

  function record(events, live) {
    for (const { type, incident } of events) {
      incidents.set(incident.id, incident);
      if (live) emit({ type: 'incident', event: type, incident });
      if (type !== 'updated') deliver(type, incident, live);
    }
  }

  // Simulated on-call endpoint: answers in 40-250 ms and occasionally needs a retry.
  function deliver(type, incident, live) {
    const flaky = Math.random() < 0.08;
    const durationMs = Math.round(40 + Math.random() * 210) + (flaky ? 400 : 0);
    const delivery = {
      id: ++deliveryId,
      event: `incident.${type}`,
      incidentId: incident.id,
      url: DEMO_WEBHOOK,
      statusCode: 202,
      ok: true,
      attempts: flaky ? 2 : 1,
      durationMs,
      error: null,
      sentAt: incident.updatedAt,
    };
    const store = () => {
      deliveries.unshift(delivery);
      deliveries.length = Math.min(deliveries.length, 200);
    };
    if (!live) return store();
    setTimeout(() => {
      store();
      emit({ type: 'webhook', delivery });
    }, durationMs);
  }

  function step(now, live) {
    const batch = simulator.tick(now);
    samples.push(...batch.samples);
    samples = samples.filter((s) => s.ts > now - HISTORY_MS);
    if (live) emit({ type: 'samples', samples: batch.samples });
    record(engine.evaluate(batch.samples, now), live);
  }

  // Backfill a few minutes of history, including one past incident, so the page is not empty on load.
  function backfill() {
    const now = Date.now();
    const start = now - 6 * 60_000;
    for (let t = start; t < now; t += TICK_MS) {
      const elapsed = t - start;
      if (elapsed === 60_000) simulator.setScenario('orders', 'spike', t);
      if (elapsed === 120_000) simulator.setScenario('orders', 'recover', t);
      step(t, false);
    }
  }

  return {
    mode: 'demo',

    connect(onMessage, onStatus) {
      emit = onMessage;
      backfill();
      onMessage({
        type: 'snapshot',
        snapshot: {
          serverTime: Date.now(),
          services: SERVICES,
          scenarioCatalog: SCENARIOS,
          rules: engine.getRules(),
          samples,
          incidents: [...incidents.values()].sort((a, b) => b.openedAt - a.openedAt),
          deliveries: [...deliveries],
          webhookUrls: [DEMO_WEBHOOK],
          store: 'browser',
        },
      });
      onStatus('demo');
      const timer = setInterval(() => step(Date.now(), true), TICK_MS);
      return () => {
        clearInterval(timer);
        emit = () => {};
      };
    },

    async setScenario(service, scenario) {
      const scenarios = simulator.setScenario(service, scenario);
      emit({ type: 'scenarios', scenarios });
      return { scenarios };
    },

    async acknowledge(id) {
      const incident = engine.acknowledge(id);
      if (!incident) throw new Error('No open incident with that id');
      incidents.set(id, incident);
      emit({ type: 'incident', event: 'acknowledged', incident });
      deliver('acknowledged', incident, true);
      return { incident };
    },

    async updateRules(rules) {
      const next = engine.setRules(rules);
      emit({ type: 'rules', rules: next });
      return { rules: next };
    },
  };
}
