'use client';

import { useEffect } from 'react';
import { METRICS, serviceName } from '@imd/core';
import { formatMetric } from '@/lib/format';

const STYLES = {
  opened: { title: 'Incident opened', bar: 'bg-amber-400' },
  escalated: { title: 'Escalated to critical', bar: 'bg-red-500' },
  resolved: { title: 'Incident resolved', bar: 'bg-emerald-400' },
};

function Toast({ toast, onDismiss }) {
  const { incident, event } = toast;
  const style = STYLES[event];
  const bar = event === 'opened' && incident.severity === 'critical' ? 'bg-red-500' : style.bar;

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 7000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div className="animate-toast-in pointer-events-auto flex overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900/95 shadow-2xl backdrop-blur">
      <div className={`w-1 shrink-0 ${bar}`} />
      <div className="min-w-0 flex-1 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">
            {style.title}
            {event !== 'resolved' && <span className="ml-1.5 text-xs font-normal capitalize text-zinc-400">· {incident.severity}</span>}
          </p>
          <span className="font-mono text-[11px] text-zinc-500">{incident.id}</span>
        </div>
        <p className="mt-0.5 text-xs text-zinc-300">
          {serviceName(incident.service)} · {METRICS[incident.metric]?.label}{' '}
          {event === 'resolved' ? 'back to normal' : `at ${formatMetric(incident.metric, incident.value)}`}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="px-3 text-zinc-500 hover:text-zinc-200"
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}

export default function Toasts({ toasts, onDismiss }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col gap-2 sm:left-auto sm:right-4 sm:w-96"
      aria-live="assertive"
      role="region"
      aria-label="Alert notifications"
    >
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
