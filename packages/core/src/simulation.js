import { SERVICES, SCENARIOS } from './catalog.js';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// Box-Muller: normally distributed noise looks far more like real telemetry than uniform noise.
function gaussian(random) {
  const u = 1 - random();
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Where each metric is heading for a given scenario. The simulator eases towards these targets.
function targetsFor(base, scenario, state) {
  switch (scenario) {
    case 'spike':
      return { cpu: 94, memory: base.memory + 16, errorRate: 3.2, latency: base.latency * 6, rps: base.rps * 3.5 };
    case 'failure':
      return { cpu: 14, memory: base.memory - 8, errorRate: 38, latency: 2600, rps: base.rps * 0.35 };
    case 'leak':
      return {
        cpu: base.cpu + 14,
        memory: Math.min(99.5, state.memory + 1.6),
        errorRate: base.errorRate + 0.8,
        latency: base.latency * 1.7,
        rps: base.rps,
      };
    default:
      return { ...base };
  }
}

// How quickly each scenario pulls metrics towards its target (0..1 per tick).
const PULL = { normal: 0.2, spike: 0.35, failure: 0.45, leak: 0.5, recover: 0.28 };

// Noise as a share of the target value, per metric.
const NOISE = { cpu: 0.05, memory: 0.012, errorRate: 0.18, latency: 0.08, rps: 0.04 };

function nearBaseline(state, base) {
  return (
    Math.abs(state.cpu - base.cpu) < 6 &&
    Math.abs(state.memory - base.memory) < 4 &&
    state.errorRate < base.errorRate + 1 &&
    state.latency < base.latency * 1.4
  );
}

/**
 * Creates a stateful telemetry generator. Each call to tick() advances every service by one step
 * and returns a sample per service.
 */
export function createSimulator({ services = SERVICES, random = Math.random } = {}) {
  const states = new Map(
    services.map((s) => [s.id, { ...s.base, scenario: 'normal', scenarioSince: Date.now() }]),
  );

  function setScenario(serviceId, scenario, now = Date.now()) {
    if (!SCENARIOS[scenario]) throw new Error(`Unknown scenario "${scenario}"`);
    const ids = serviceId === 'all' ? services.map((s) => s.id) : [serviceId];
    for (const id of ids) {
      const state = states.get(id);
      if (!state) throw new Error(`Unknown service "${id}"`);
      state.scenario = scenario;
      state.scenarioSince = now;
    }
    return getScenarios();
  }

  function getScenarios() {
    return Object.fromEntries([...states].map(([id, s]) => [id, { scenario: s.scenario, since: s.scenarioSince }]));
  }

  function tick(now = Date.now()) {
    const samples = services.map((service) => {
      const state = states.get(service.id);
      const target = targetsFor(service.base, state.scenario, state);
      const pull = PULL[state.scenario] ?? 0.2;

      for (const key of Object.keys(NOISE)) {
        const next = state[key] + (target[key] - state[key]) * pull;
        state[key] = next + gaussian(random) * NOISE[key] * Math.max(target[key], 1);
      }
      state.cpu = clamp(state.cpu, 1, 100);
      state.memory = clamp(state.memory, 5, 100);
      state.errorRate = clamp(state.errorRate, 0, 100);
      state.latency = clamp(state.latency, 10, 10000);
      state.rps = Math.max(0, state.rps);

      // A recovery finishes on its own once the service is back near its baseline.
      if (state.scenario === 'recover' && nearBaseline(state, service.base)) {
        state.scenario = 'normal';
        state.scenarioSince = now;
      }

      return {
        ts: now,
        service: service.id,
        cpu: round(state.cpu, 1),
        memory: round(state.memory, 1),
        errorRate: round(state.errorRate, 2),
        latency: round(state.latency, 0),
        rps: round(state.rps, 0),
        scenario: state.scenario,
      };
    });
    return { ts: now, samples };
  }

  return { tick, setScenario, getScenarios };
}

function round(v, digits) {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
