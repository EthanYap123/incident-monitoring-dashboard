// Services the simulator models, with their healthy baseline readings.
export const SERVICES = [
  { id: 'api-gateway', name: 'API Gateway', base: { cpu: 38, memory: 52, errorRate: 0.4, latency: 120, rps: 840 } },
  { id: 'auth-service', name: 'Auth Service', base: { cpu: 26, memory: 44, errorRate: 0.2, latency: 85, rps: 410 } },
  { id: 'payments', name: 'Payments', base: { cpu: 33, memory: 58, errorRate: 0.3, latency: 210, rps: 120 } },
  { id: 'orders', name: 'Orders', base: { cpu: 42, memory: 61, errorRate: 0.5, latency: 160, rps: 260 } },
];

// Metrics the alert engine watches. `ceiling` caps simulated values.
export const METRICS = {
  cpu: { label: 'CPU usage', unit: '%', ceiling: 100, decimals: 0 },
  memory: { label: 'Memory pressure', unit: '%', ceiling: 100, decimals: 0 },
  errorRate: { label: 'Error rate', unit: '%', ceiling: 100, decimals: 1 },
  latency: { label: 'p95 latency', unit: 'ms', ceiling: 10000, decimals: 0 },
};

export const METRIC_KEYS = Object.keys(METRICS);

export const SCENARIOS = {
  normal: { label: 'Normal', description: 'Baseline traffic with small random noise.' },
  spike: { label: 'Traffic spike', description: 'Requests jump ~3.5x: CPU and latency climb, a few errors.' },
  failure: { label: 'Server failure', description: 'Instances crash: error rate and latency shoot up, throughput drops.' },
  leak: { label: 'Memory leak', description: 'Memory grows every tick until the service is restarted.' },
  recover: { label: 'Recover', description: 'Roll back and drain: metrics ease back to baseline, then normal.' },
};

export const DEFAULT_RULES = [
  { metric: 'cpu', warning: 80, critical: 92 },
  { metric: 'memory', warning: 85, critical: 95 },
  { metric: 'errorRate', warning: 5, critical: 15 },
  { metric: 'latency', warning: 600, critical: 1500 },
];

export function formatMetric(metric, value) {
  if (value == null || Number.isNaN(value)) return '–';
  const def = METRICS[metric];
  if (!def) return String(value);
  return `${value.toFixed(def.decimals)}${def.unit === '%' ? '%' : ` ${def.unit}`}`;
}

export function serviceName(id) {
  return SERVICES.find((s) => s.id === id)?.name ?? id;
}
