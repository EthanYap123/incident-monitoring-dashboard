// A service with no sample for this long is shown as offline.
export const STALE_AFTER_MS = 10_000;

const RANK = { healthy: 0, degraded: 1, critical: 2, offline: 3 };

/** Health of one service, from its open incidents and how recently it reported. */
export function serviceHealth(serviceId, incidents, lastSeen, now = Date.now()) {
  if (!lastSeen || now - lastSeen > STALE_AFTER_MS) return 'offline';
  let health = 'healthy';
  for (const inc of incidents) {
    if (inc.service !== serviceId || inc.status === 'resolved') continue;
    const h = inc.severity === 'critical' ? 'critical' : 'degraded';
    if (RANK[h] > RANK[health]) health = h;
  }
  return health;
}

/** Worst health across all services, for the page header. */
export function overallHealth(healths) {
  return healths.reduce((worst, h) => (RANK[h] > RANK[worst] ? h : worst), 'healthy');
}

/** Webhook body sent for every incident lifecycle event. */
export function webhookPayload(type, incident, sentAt = Date.now()) {
  return {
    event: `incident.${type}`,
    sentAt: new Date(sentAt).toISOString(),
    source: 'incident-monitoring-dashboard',
    incident: {
      ...incident,
      openedAt: toIso(incident.openedAt),
      acknowledgedAt: toIso(incident.acknowledgedAt),
      resolvedAt: toIso(incident.resolvedAt),
      updatedAt: toIso(incident.updatedAt),
    },
  };
}

function toIso(ts) {
  return ts == null ? null : new Date(ts).toISOString();
}
