import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAlertEngine } from '../src/index.js';

const sample = (overrides) => ({ service: 'payments', cpu: 30, memory: 50, errorRate: 0.2, latency: 150, ...overrides });

test('opens an incident only after consecutive breaches', () => {
  const engine = createAlertEngine({ breachSamples: 2 });
  assert.deepEqual(engine.evaluate([sample({ cpu: 85 })], 1), []);
  const events = engine.evaluate([sample({ cpu: 86 })], 2);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'opened');
  assert.equal(events[0].incident.severity, 'warning');
  assert.equal(events[0].incident.metric, 'cpu');
  assert.equal(events[0].incident.id, 'INC-1001');
});

test('a single spike does not open an incident', () => {
  const engine = createAlertEngine({ breachSamples: 2 });
  engine.evaluate([sample({ errorRate: 40 })], 1);
  assert.deepEqual(engine.evaluate([sample()], 2), []);
  assert.deepEqual(engine.openIncidents(), []);
});

test('escalates warning to critical and tracks the peak', () => {
  const engine = createAlertEngine({ breachSamples: 1 });
  engine.evaluate([sample({ latency: 700 })], 1);
  const [event] = engine.evaluate([sample({ latency: 2000 })], 2);
  assert.equal(event.type, 'escalated');
  assert.equal(event.incident.severity, 'critical');
  assert.equal(event.incident.peak, 2000);
  assert.equal(event.incident.threshold, 1500);
});

test('reports a new peak, but not a lower reading', () => {
  const engine = createAlertEngine({ breachSamples: 1 });
  engine.evaluate([sample({ errorRate: 20 })], 1);
  const [event] = engine.evaluate([sample({ errorRate: 30 })], 2);
  assert.equal(event.type, 'updated');
  assert.equal(event.incident.peak, 30);
  assert.deepEqual(engine.evaluate([sample({ errorRate: 25 })], 3), []);
});

test('resolves after enough clear readings', () => {
  const engine = createAlertEngine({ breachSamples: 1, clearSamples: 3 });
  engine.evaluate([sample({ memory: 96 })], 1);
  assert.deepEqual(engine.evaluate([sample()], 2), []);
  assert.deepEqual(engine.evaluate([sample()], 3), []);
  const [event] = engine.evaluate([sample()], 4);
  assert.equal(event.type, 'resolved');
  assert.equal(event.incident.resolvedAt, 4);
  assert.equal(engine.openIncidents().length, 0);
});

test('a breach during the clear window resets the countdown', () => {
  const engine = createAlertEngine({ breachSamples: 1, clearSamples: 2 });
  engine.evaluate([sample({ cpu: 95 })], 1);
  engine.evaluate([sample()], 2);
  engine.evaluate([sample({ cpu: 90 })], 3);
  assert.deepEqual(engine.evaluate([sample()], 4), []);
  assert.equal(engine.evaluate([sample()], 5)[0].type, 'resolved');
});

test('acknowledging keeps the incident open until it resolves', () => {
  const engine = createAlertEngine({ breachSamples: 1, clearSamples: 1 });
  const [{ incident }] = engine.evaluate([sample({ errorRate: 20 })], 1);
  const acked = engine.acknowledge(incident.id, 5);
  assert.equal(acked.status, 'acknowledged');
  assert.equal(acked.acknowledgedAt, 5);
  const [resolved] = engine.evaluate([sample()], 6);
  assert.equal(resolved.incident.status, 'resolved');
  assert.equal(resolved.incident.acknowledgedAt, 5);
});

test('rules can be changed and are validated', () => {
  const engine = createAlertEngine({ breachSamples: 1 });
  assert.throws(() => engine.setRules([{ metric: 'cpu', warning: 90, critical: 80 }]), /below critical/);
  assert.throws(() => engine.setRules([{ metric: 'disk', warning: 1, critical: 2 }]), /Unknown metric/);
  engine.setRules([{ metric: 'cpu', warning: 20, critical: 99 }]);
  assert.equal(engine.evaluate([sample({ cpu: 30 })], 1)[0].incident.severity, 'warning');
});

test('restores open incidents and continues numbering', () => {
  const engine = createAlertEngine({ breachSamples: 1, clearSamples: 1 });
  engine.restore([{ id: 'INC-1041', seq: 41, service: 'orders', metric: 'cpu', severity: 'warning', status: 'open', peak: 85 }]);
  const [resolved] = engine.evaluate([sample({ service: 'orders' })], 2);
  assert.equal(resolved.incident.id, 'INC-1041');
  const [opened] = engine.evaluate([sample({ errorRate: 30 })], 3);
  assert.equal(opened.incident.id, 'INC-1042');
});
