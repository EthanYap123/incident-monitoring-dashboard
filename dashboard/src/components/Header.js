import { HEALTH_STYLES, formatClock } from '@/lib/format';

const CONNECTION = {
  connecting: { label: 'Connecting…', dot: 'bg-zinc-400', hint: 'Opening a WebSocket to the collector' },
  live: { label: 'Live · WebSocket', dot: 'bg-emerald-400 pulse-dot text-emerald-400', hint: 'Updates are pushed by the collector' },
  reconnecting: { label: 'Reconnecting…', dot: 'bg-amber-400', hint: 'Connection dropped, retrying' },
  polling: { label: 'Live · Polling', dot: 'bg-sky-400', hint: 'WebSocket unavailable, polling every 3 s' },
  offline: { label: 'Collector offline', dot: 'bg-red-500', hint: 'Cannot reach the collector API' },
  demo: { label: 'Demo · In-browser', dot: 'bg-violet-400 pulse-dot text-violet-400', hint: 'Simulator and alert engine run in this tab' },
};

export default function Header({ overall, status, openCount, now }) {
  const health = HEALTH_STYLES[overall];
  const conn = CONNECTION[status] ?? CONNECTION.connecting;

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 32 32" className="h-9 w-9 shrink-0" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="#18181b" stroke="#27272a" />
          <polyline points="5,18 10,18 13,10 18,23 21,14 24,18 27,18" fill="none" stroke="#f97316" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div>
          <h1 className="text-lg font-semibold leading-tight tracking-tight">Incident Monitor</h1>
          <p className="text-xs text-zinc-400">Containerized fleet · 4 services · 2 s telemetry</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-medium ${health.ring} ${health.text}`}>
          <span className={`h-2 w-2 rounded-full ${health.dot}`} />
          {overall === 'healthy' ? 'All systems operational' : `Fleet ${health.label.toLowerCase()}`}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-medium ${
            openCount ? 'border-red-500/40 bg-red-500/10 text-red-300' : 'border-zinc-700 bg-zinc-900 text-zinc-400'
          }`}
        >
          {openCount} active incident{openCount === 1 ? '' : 's'}
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-zinc-300" title={conn.hint}>
          <span className={`h-2 w-2 rounded-full ${conn.dot}`} />
          {conn.label}
        </span>
        <span className="hidden font-mono tabular text-zinc-500 md:inline" suppressHydrationWarning>
          {formatClock(now)}
        </span>
      </div>
    </header>
  );
}
