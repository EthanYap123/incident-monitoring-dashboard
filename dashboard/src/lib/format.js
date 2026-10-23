export { formatMetric } from '@imd/core';

export const SERIES_COLORS = ['var(--color-series-1)', 'var(--color-series-2)', 'var(--color-series-3)', 'var(--color-series-4)'];

export function formatClock(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export function formatDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
}

export function formatAgo(ts, now) {
  const s = Math.round((now - ts) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function formatCompact(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

export const HEALTH_STYLES = {
  healthy: { label: 'Healthy', dot: 'bg-emerald-400', text: 'text-emerald-300', ring: 'border-emerald-500/30 bg-emerald-500/10' },
  degraded: { label: 'Degraded', dot: 'bg-amber-400', text: 'text-amber-300', ring: 'border-amber-500/30 bg-amber-500/10' },
  critical: { label: 'Critical', dot: 'bg-red-500', text: 'text-red-300', ring: 'border-red-500/40 bg-red-500/10' },
  offline: { label: 'Offline', dot: 'bg-zinc-500', text: 'text-zinc-400', ring: 'border-zinc-600 bg-zinc-800/60' },
};

export const SEVERITY_STYLES = {
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  critical: 'border-red-500/40 bg-red-500/10 text-red-300',
};

export const STATUS_STYLES = {
  open: 'text-red-300',
  acknowledged: 'text-sky-300',
  resolved: 'text-zinc-400',
};
