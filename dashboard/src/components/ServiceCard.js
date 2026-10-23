import { METRIC_KEYS, METRICS } from '@imd/core';
import { HEALTH_STYLES, formatCompact, formatMetric } from '@/lib/format';

function levelColor(rule, value) {
  if (!rule || value == null) return 'text-zinc-100';
  if (value >= rule.critical) return 'text-red-300';
  if (value >= rule.warning) return 'text-amber-300';
  return 'text-zinc-100';
}

function Sparkline({ points, color }) {
  if (points.length < 2) return <div className="h-8" />;
  const values = points.map((p) => p.latency);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const d = values
    .map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(2)},${(30 - ((v - min) / range) * 28).toFixed(2)}`)
    .join(' ');
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-8 w-full" aria-hidden="true">
      <polyline points={d} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function ServiceCard({ service, color, health, latest, scenario, scenarioLabel, rules, history }) {
  const style = HEALTH_STYLES[health];
  const ruleFor = (metric) => rules.find((r) => r.metric === metric);

  return (
    <article className={`panel flex flex-col gap-3 p-4 ${health === 'critical' ? 'border-red-500/40' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 truncate text-sm font-semibold">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} />
            {service.name}
          </h2>
          <p className="mt-0.5 font-mono text-[11px] text-zinc-500">{service.id}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${style.ring} ${style.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
          {style.label}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        {METRIC_KEYS.map((metric) => (
          <div key={metric} className="min-w-0">
            <dt className="truncate text-[11px] text-zinc-500">{METRICS[metric].label}</dt>
            <dd className={`font-mono text-base font-medium tabular ${levelColor(ruleFor(metric), latest?.[metric])}`}>
              {formatMetric(metric, latest?.[metric])}
            </dd>
          </div>
        ))}
      </dl>

      <div>
        <div className="flex items-center justify-between text-[11px] text-zinc-500">
          <span>Latency trend</span>
          <span className="font-mono tabular">{latest ? `${formatCompact(latest.rps)} req/s` : '–'}</span>
        </div>
        <Sparkline points={history.slice(-60)} color={color} />
      </div>

      <div className="flex min-h-5 items-center text-[11px]">
        {scenario && scenario !== 'normal' ? (
          <span className="rounded border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-violet-300">
            Scenario: {scenarioLabel}
          </span>
        ) : (
          <span className="text-zinc-600">No active scenario</span>
        )}
      </div>
    </article>
  );
}
