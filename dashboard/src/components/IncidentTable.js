'use client';

import { useState } from 'react';
import { METRICS, serviceName } from '@imd/core';
import { SEVERITY_STYLES, STATUS_STYLES, formatClock, formatDuration, formatMetric } from '@/lib/format';

const FILTERS = [
  { id: 'active', label: 'Active', test: (i) => i.status !== 'resolved' },
  { id: 'resolved', label: 'Resolved', test: (i) => i.status === 'resolved' },
  { id: 'all', label: 'All', test: () => true },
];

export default function IncidentTable({ incidents, now, onAcknowledge }) {
  const [filter, setFilter] = useState('all');
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);

  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, incidents.filter(f.test).length]));
  const rows = incidents.filter(FILTERS.find((f) => f.id === filter).test);

  const ack = async (id) => {
    setPending(id);
    setError(null);
    try {
      await onAcknowledge(id);
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="panel" aria-labelledby="incidents-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <h2 id="incidents-title" className="panel-title">Incident log</h2>
        <div className="flex rounded-lg border border-zinc-800 bg-zinc-950/60 p-0.5 text-xs" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-md px-2.5 py-1 transition-colors ${filter === f.id ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              {f.label} <span className="tabular text-zinc-500">{counts[f.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {error && <p className="px-4 pt-3 text-xs text-red-300" role="alert">{error}</p>}

      <div className="max-h-[420px] overflow-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="sticky top-0 z-[1] bg-zinc-900 text-[11px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-2 font-medium">Incident</th>
              <th className="px-3 py-2 font-medium">Severity</th>
              <th className="px-3 py-2 font-medium">Service · Metric</th>
              <th className="px-3 py-2 font-medium">Peak / Threshold</th>
              <th className="px-3 py-2 font-medium">Opened</th>
              <th className="px-3 py-2 font-medium">Duration</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-4 py-2 text-right font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/80">
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-zinc-500">
                  {filter === 'active' ? 'No active incidents. Try a chaos control to trigger one.' : 'Nothing here yet.'}
                </td>
              </tr>
            )}
            {rows.map((i) => (
              <tr key={i.id} className={i.status === 'resolved' ? 'text-zinc-400' : ''}>
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-zinc-300">{i.id}</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-block rounded border px-1.5 py-0.5 text-[11px] font-medium capitalize ${SEVERITY_STYLES[i.severity]}`}>
                    {i.severity}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <div className="font-medium text-zinc-200">{serviceName(i.service)}</div>
                  <div className="text-xs text-zinc-500">{METRICS[i.metric]?.label ?? i.metric}</div>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs tabular">
                  <span className="text-zinc-200">{formatMetric(i.metric, i.peak)}</span>
                  <span className="text-zinc-500"> / {formatMetric(i.metric, i.threshold)}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs tabular text-zinc-400">{formatClock(i.openedAt)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs tabular">
                  {formatDuration((i.resolvedAt ?? now) - i.openedAt)}
                </td>
                <td className={`whitespace-nowrap px-3 py-2.5 text-xs font-medium capitalize ${STATUS_STYLES[i.status]}`}>
                  {i.status === 'open' && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-red-400 align-middle" />}
                  {i.status}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {i.status === 'open' && (
                    <button
                      type="button"
                      onClick={() => ack(i.id)}
                      disabled={pending === i.id}
                      className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-200 hover:border-sky-500/60 hover:text-sky-200 disabled:opacity-50"
                    >
                      {pending === i.id ? 'Acking…' : 'Acknowledge'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
