import { DEFAULT_RULES, METRICS, formatMetric, serviceName } from './catalog.js';

/**
 * Threshold alerting with hysteresis:
 * - an incident opens after `breachSamples` consecutive readings over the warning threshold,
 * - it escalates to critical as soon as a reading crosses the critical threshold,
 * - it resolves after `clearSamples` consecutive readings back under the warning threshold.
 * One incident per service + metric can be open at a time, so a flapping metric does not spam.
 * Events: opened, escalated, resolved (all worth a notification) and updated (new peak only).
 */
export function createAlertEngine({
  rules = DEFAULT_RULES,
  breachSamples = 2,
  clearSamples = 3,
  nextSeq = 1,
} = {}) {
  let ruleMap = toRuleMap(rules);
  let seq = nextSeq;
  const tracks = new Map(); // `${service}:${metric}` -> { breaches, clears, incident }

  function track(service, metric) {
    const key = `${service}:${metric}`;
    if (!tracks.has(key)) tracks.set(key, { breaches: 0, clears: 0, incident: null });
    return tracks.get(key);
  }

  function levelFor(metric, value) {
    const rule = ruleMap[metric];
    if (!rule) return null;
    if (value >= rule.critical) return 'critical';
    if (value >= rule.warning) return 'warning';
    return null;
  }

  function evaluate(samples, now = Date.now()) {
    const events = [];
    for (const sample of samples) {
      for (const metric of Object.keys(ruleMap)) {
        const value = sample[metric];
        if (value == null) continue;
        const t = track(sample.service, metric);
        const level = levelFor(metric, value);
        const open = t.incident;

        if (level) {
          t.breaches += 1;
          t.clears = 0;
          if (!open && t.breaches >= breachSamples) {
            t.incident = openIncident(sample.service, metric, level, value, now);
            events.push({ type: 'opened', incident: { ...t.incident } });
          } else if (open) {
            const newPeak = value > open.peak;
            open.value = value;
            open.peak = Math.max(open.peak, value);
            open.updatedAt = now;
            if (level === 'critical' && open.severity === 'warning') {
              open.severity = 'critical';
              open.threshold = ruleMap[metric].critical;
              open.message = describe(open);
              events.push({ type: 'escalated', incident: { ...open } });
            } else if (newPeak) {
              // Lets the incident log show a growing peak without a write on every sample.
              events.push({ type: 'updated', incident: { ...open } });
            }
          }
        } else {
          t.breaches = 0;
          if (open) {
            open.value = value;
            open.updatedAt = now;
            t.clears += 1;
            if (t.clears >= clearSamples) {
              open.status = 'resolved';
              open.resolvedAt = now;
              t.incident = null;
              t.clears = 0;
              events.push({ type: 'resolved', incident: { ...open } });
            }
          }
        }
      }
    }
    return events;
  }

  function openIncident(service, metric, severity, value, now) {
    const incident = {
      id: `INC-${1000 + seq}`,
      seq,
      service,
      metric,
      severity,
      status: 'open',
      threshold: ruleMap[metric][severity],
      value,
      peak: value,
      openedAt: now,
      acknowledgedAt: null,
      resolvedAt: null,
      updatedAt: now,
    };
    incident.message = describe(incident);
    seq += 1;
    return incident;
  }

  function acknowledge(id, now = Date.now()) {
    for (const t of tracks.values()) {
      if (t.incident?.id === id) {
        if (t.incident.status === 'open') {
          t.incident.status = 'acknowledged';
          t.incident.acknowledgedAt = now;
          t.incident.updatedAt = now;
        }
        return { ...t.incident };
      }
    }
    return null;
  }

  // Re-attach incidents that were still open when the process restarted.
  function restore(incidents) {
    for (const inc of incidents) {
      if (inc.status === 'resolved') continue;
      track(inc.service, inc.metric).incident = { ...inc };
      seq = Math.max(seq, (inc.seq ?? 0) + 1);
    }
  }

  function setRules(next) {
    for (const rule of next) {
      if (!METRICS[rule.metric]) throw new Error(`Unknown metric "${rule.metric}"`);
      if (!(Number.isFinite(rule.warning) && Number.isFinite(rule.critical))) {
        throw new Error(`Thresholds for ${rule.metric} must be numbers`);
      }
      if (rule.warning >= rule.critical) {
        throw new Error(`${METRICS[rule.metric].label}: warning must be below critical`);
      }
    }
    ruleMap = { ...ruleMap, ...toRuleMap(next) };
    return getRules();
  }

  function getRules() {
    return Object.values(ruleMap).map((r) => ({ ...r }));
  }

  function openIncidents() {
    return [...tracks.values()].filter((t) => t.incident).map((t) => ({ ...t.incident }));
  }

  return { evaluate, acknowledge, restore, setRules, getRules, openIncidents };
}

function toRuleMap(rules) {
  return Object.fromEntries(rules.map((r) => [r.metric, { metric: r.metric, warning: r.warning, critical: r.critical }]));
}

function describe(inc) {
  const label = METRICS[inc.metric]?.label ?? inc.metric;
  return `${serviceName(inc.service)}: ${label} at ${formatMetric(inc.metric, inc.value)} (${inc.severity} threshold ${formatMetric(inc.metric, inc.threshold)})`;
}
