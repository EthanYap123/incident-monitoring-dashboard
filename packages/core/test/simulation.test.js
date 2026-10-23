import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimulator, createAlertEngine, serviceHealth, SERVICES } from '../src/index.js';

// Deterministic pseudo-random source so the tests never flake.
function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function run(sim, engine, ticks, start = 0) {
  const events = [];
  for (let i = 0; i < ticks; i++) {
    const { samples } = sim.tick(start + i * 2000);
    events.push(...engine.evaluate(samples, start + i * 2000));
  }
  return events;
}

test('normal traffic stays quiet', () => {
  const sim = createSimulator({ random: seeded() });
  const engine = createAlertEngine();
  assert.deepEqual(run(sim, engine, 150), []);
});

test('every sample has all metrics for every service', () => {
  const sim = createSimulator({ random: seeded() });
  const { samples } = sim.tick(1);
  assert.equal(samples.length, SERVICES.length);
  for (const s of samples) {
    for (const key of ['cpu', 'memory', 'errorRate', 'latency', 'rps']) assert.equal(typeof s[key], 'number');
  }
});

test('a server failure raises critical incidents, and recovery resolves them', () => {
  const sim = createSimulator({ random: seeded() });
  const engine = createAlertEngine();
  sim.setScenario('payments', 'failure');
  const opened = run(sim, engine, 10).filter((e) => e.type === 'opened' || e.type === 'escalated');
  const metrics = new Set(opened.map((e) => e.incident.metric));
  assert.ok(metrics.has('errorRate'));
  assert.ok(metrics.has('latency'));
  assert.equal(serviceHealth('payments', engine.openIncidents(), 20_000, 20_000), 'critical');
  assert.equal(serviceHealth('orders', engine.openIncidents(), 20_000, 20_000), 'healthy');

  sim.setScenario('payments', 'recover');
  run(sim, engine, 40, 20_000);
  assert.equal(engine.openIncidents().length, 0);
  assert.equal(sim.getScenarios().payments.scenario, 'normal');
});

test('a traffic spike pushes CPU over the threshold', () => {
  const sim = createSimulator({ random: seeded(7) });
  const engine = createAlertEngine();
  sim.setScenario('all', 'spike');
  const events = run(sim, engine, 15);
  assert.ok(events.some((e) => e.incident.metric === 'cpu'));
});

test('a memory leak keeps growing until it alerts', () => {
  const sim = createSimulator({ random: seeded(3) });
  const engine = createAlertEngine();
  sim.setScenario('orders', 'leak');
  const events = run(sim, engine, 80);
  assert.ok(events.some((e) => e.incident.service === 'orders' && e.incident.metric === 'memory'));
});

test('unknown scenarios and services are rejected', () => {
  const sim = createSimulator();
  assert.throws(() => sim.setScenario('payments', 'meteor'), /Unknown scenario/);
  assert.throws(() => sim.setScenario('nope', 'spike'), /Unknown service/);
});
