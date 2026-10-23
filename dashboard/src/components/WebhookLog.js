import { formatAgo } from '@/lib/format';

const EVENT_STYLES = {
  'incident.opened': 'text-red-300',
  'incident.escalated': 'text-red-300',
  'incident.acknowledged': 'text-sky-300',
  'incident.resolved': 'text-emerald-300',
};

export default function WebhookLog({ deliveries, urls, now }) {
  const failed = deliveries.filter((d) => !d.ok).length;

  return (
    <section className="panel flex flex-col" aria-labelledby="webhooks-title">
      <div className="border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 id="webhooks-title" className="panel-title">Webhook deliveries</h2>
          <span className="text-[11px] text-zinc-500">
            {deliveries.length} sent{failed ? <span className="text-red-300"> · {failed} failed</span> : null}
          </span>
        </div>
        <p className="mt-1 truncate font-mono text-[11px] text-zinc-500" title={urls.join(', ')}>
          POST → {urls.join(', ') || 'no endpoint configured'}
        </p>
      </div>
      <ul className="max-h-[420px] divide-y divide-zinc-800/80 overflow-y-auto">
        {deliveries.length === 0 && <li className="px-4 py-10 text-center text-sm text-zinc-500">No webhooks fired yet.</li>}
        {deliveries.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
            <div className="min-w-0">
              <div className={`font-mono ${EVENT_STYLES[d.event] ?? 'text-zinc-300'}`}>{d.event}</div>
              <div className="truncate text-zinc-500">
                {d.incidentId} · {formatAgo(d.sentAt, now)}
                {d.attempts > 1 ? ` · ${d.attempts} attempts` : ''}
              </div>
            </div>
            <div className="shrink-0 text-right font-mono tabular">
              <div className={d.ok ? 'text-emerald-300' : 'text-red-300'}>{d.statusCode ?? 'ERR'}</div>
              <div className="text-zinc-500">{d.durationMs} ms</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
