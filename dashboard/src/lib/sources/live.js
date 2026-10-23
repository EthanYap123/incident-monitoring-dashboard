// Talks to the metrics collector: a WebSocket for pushed updates, REST for actions.
// If the socket keeps failing, it falls back to polling the snapshot endpoint until the socket recovers.

const POLL_MS = 3000;
const FAILURES_BEFORE_POLLING = 3;

function urls() {
  const base = (process.env.NEXT_PUBLIC_COLLECTOR_URL ?? '').replace(/\/$/, '');
  if (base) return { api: base, ws: `${base.replace(/^http/, 'ws')}/ws` };
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return { api: '', ws: `${scheme}://${window.location.host}/ws` };
}

async function request(path, options = {}) {
  const res = await fetch(`${urls().api}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...options.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

export function createLiveSource() {
  return {
    mode: 'live',

    connect(onMessage, onStatus) {
      let socket = null;
      let stopped = false;
      let failures = 0;
      let retryTimer = null;
      let pollTimer = null;

      const startPolling = () => {
        if (pollTimer) return;
        const poll = async () => {
          try {
            onMessage({ type: 'snapshot', snapshot: await request('/api/snapshot') });
            onStatus('polling');
          } catch {
            onStatus('offline');
          }
        };
        poll();
        pollTimer = setInterval(poll, POLL_MS);
      };

      const stopPolling = () => {
        clearInterval(pollTimer);
        pollTimer = null;
      };

      const open = () => {
        if (stopped) return;
        onStatus(failures === 0 ? 'connecting' : pollTimer ? 'polling' : 'reconnecting');
        socket = new WebSocket(urls().ws);

        socket.onopen = () => {
          failures = 0;
          stopPolling();
          onStatus('live');
        };
        socket.onmessage = (event) => {
          try {
            onMessage(JSON.parse(event.data));
          } catch {
            // Ignore malformed frames rather than killing the stream.
          }
        };
        socket.onclose = () => {
          socket = null;
          if (stopped) return;
          failures += 1;
          if (failures >= FAILURES_BEFORE_POLLING) startPolling();
          else onStatus('reconnecting');
          const delay = Math.min(1000 * 2 ** (failures - 1), 10_000);
          retryTimer = setTimeout(open, delay);
        };
      };

      open();

      return () => {
        stopped = true;
        clearTimeout(retryTimer);
        stopPolling();
        socket?.close();
      };
    },

    setScenario: (service, scenario) =>
      request('/api/scenarios', { method: 'POST', body: JSON.stringify({ service, scenario }) }),

    acknowledge: (id) => request(`/api/incidents/${encodeURIComponent(id)}/acknowledge`, { method: 'POST' }),

    updateRules: (rules) => request('/api/rules', { method: 'PUT', body: JSON.stringify({ rules }) }),
  };
}
