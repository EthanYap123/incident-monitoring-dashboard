import { webhookPayload } from '@imd/core';

const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 3000;

/**
 * Sends an incident event to every configured URL, retrying with a short backoff.
 * Each URL produces one delivery record (with the number of attempts it took).
 */
export function createWebhookDispatcher({ urls, store, onDelivery }) {
  async function deliver(url, type, incident) {
    const body = JSON.stringify(webhookPayload(type, incident));
    const started = Date.now();
    let statusCode = null;
    let error = null;
    let attempts = 0;

    while (attempts < MAX_ATTEMPTS) {
      attempts += 1;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-incident-event': `incident.${type}` },
          body,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        statusCode = res.status;
        if (res.ok) {
          error = null;
          break;
        }
        error = `HTTP ${res.status}`;
      } catch (err) {
        error = err.name === 'TimeoutError' ? `timed out after ${TIMEOUT_MS}ms` : err.message;
      }
      if (attempts < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 400 * attempts));
    }

    const delivery = await store.saveDelivery({
      event: `incident.${type}`,
      incidentId: incident.id,
      url,
      statusCode,
      ok: error == null,
      attempts,
      durationMs: Date.now() - started,
      error,
      sentAt: started,
    });
    if (!delivery.ok) console.warn(`[collector] webhook to ${url} failed after ${attempts} attempts: ${error}`);
    onDelivery(delivery);
  }

  return {
    urls,
    dispatch(type, incident) {
      for (const url of urls) {
        deliver(url, type, incident).catch((err) => console.error('[collector] webhook bookkeeping failed:', err.message));
      }
    },
  };
}
