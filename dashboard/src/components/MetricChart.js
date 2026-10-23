'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { METRICS } from '@imd/core';
import { formatClock, formatMetric, SERIES_COLORS } from '@/lib/format';

const HEIGHT = 188;
const PAD = { top: 10, right: 12, bottom: 22, left: 44 };

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

// Splits a series where samples are missing (e.g. the collector restarted), so no line bridges the gap.
const GAP_MS = 8000;
function segments(points) {
  const out = [];
  let current = [];
  for (const p of points) {
    if (current.length && p.ts - current[current.length - 1].ts > GAP_MS) {
      out.push(current);
      current = [];
    }
    current.push(p);
  }
  if (current.length) out.push(current);
  return out;
}

function tickLabel(metric, unit, v) {
  if (metric === 'latency') return v >= 1000 ? `${+(v / 1000).toFixed(2)}s` : `${Math.round(v)}`;
  return `${+v.toFixed(1)}${unit === '%' ? '%' : ''}`;
}

function niceMax(value) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const n = value / magnitude;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * magnitude;
}

/** Multi-series line chart for one metric, with warning/critical threshold lines and a hover readout. */
export default function MetricChart({ metric, services, history, rule, windowMs, now }) {
  const [ref, width] = useWidth();
  const [hoverX, setHoverX] = useState(null);
  const def = METRICS[metric];

  const start = now - windowMs;
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;

  const { series, yMax } = useMemo(() => {
    let max = 0;
    const series = services.map((svc, i) => {
      const points = (history[svc.id] ?? []).filter((s) => s.ts >= start - 4000);
      for (const p of points) max = Math.max(max, p[metric]);
      return { id: svc.id, name: svc.name, color: SERIES_COLORS[i % SERIES_COLORS.length], points };
    });
    const floor = def.unit === '%' && metric !== 'errorRate' ? 100 : (rule?.critical ?? 0) * 1.2;
    return { series, yMax: def.unit === '%' && metric !== 'errorRate' ? 100 : niceMax(Math.max(max * 1.1, floor)) };
  }, [services, history, start, metric, def.unit, rule]);

  const x = (ts) => PAD.left + ((ts - start) / windowMs) * innerW;
  const y = (v) => PAD.top + innerH - (Math.min(v, yMax) / yMax) * innerH;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  const xTicks = [];
  const tickStep = windowMs <= 2 * 60_000 ? 30_000 : windowMs <= 5 * 60_000 ? 60_000 : 120_000;
  for (let t = Math.ceil(start / tickStep) * tickStep; t <= now; t += tickStep) xTicks.push(t);

  const hoverTs = hoverX == null ? null : start + ((hoverX - PAD.left) / innerW) * windowMs;
  const readout = hoverTs == null ? null : series.map((s) => {
    let best = null;
    for (const p of s.points) if (!best || Math.abs(p.ts - hoverTs) < Math.abs(best.ts - hoverTs)) best = p;
    return { ...s, point: best && Math.abs(best.ts - hoverTs) < 5000 ? best : null };
  });

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    setHoverX(px >= PAD.left && px <= PAD.left + innerW ? px : null);
  };

  return (
    <div className="panel p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-zinc-200">{def.label}</h3>
        {rule && (
          <span className="text-[11px] text-zinc-500">
            warn <span className="text-amber-300/90">{formatMetric(metric, rule.warning)}</span> · crit{' '}
            <span className="text-red-300/90">{formatMetric(metric, rule.critical)}</span>
          </span>
        )}
      </div>
      <div ref={ref} className="relative w-full" style={{ height: HEIGHT }}>
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            className="block touch-none select-none"
            onPointerMove={onMove}
            onPointerLeave={() => setHoverX(null)}
            role="img"
            aria-label={`${def.label} for each service over the last ${Math.round(windowMs / 60000)} minutes`}
          >
            <defs>
              <clipPath id={`clip-${metric}`}>
                <rect x={PAD.left} y={PAD.top - 2} width={innerW} height={innerH + 4} />
              </clipPath>
            </defs>

            {yTicks.map((v) => (
              <g key={v}>
                <line x1={PAD.left} x2={PAD.left + innerW} y1={y(v)} y2={y(v)} stroke="#27272a" strokeWidth="1" />
                <text x={PAD.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-zinc-500 text-[10px] tabular">
                  {tickLabel(metric, def.unit, v)}
                </text>
              </g>
            ))}
            {xTicks.map((t) => (
              <text key={t} x={x(t)} y={HEIGHT - 6} textAnchor="middle" className="fill-zinc-500 text-[10px] tabular">
                {formatClock(t).slice(0, 5)}
              </text>
            ))}

            {rule && rule.warning <= yMax && (
              <line x1={PAD.left} x2={PAD.left + innerW} y1={y(rule.warning)} y2={y(rule.warning)} stroke="#f59e0b" strokeOpacity="0.6" strokeDasharray="4 4" />
            )}
            {rule && rule.critical <= yMax && (
              <line x1={PAD.left} x2={PAD.left + innerW} y1={y(rule.critical)} y2={y(rule.critical)} stroke="#ef4444" strokeOpacity="0.7" strokeDasharray="4 4" />
            )}

            <g clipPath={`url(#clip-${metric})`}>
              {series.map((s) =>
                segments(s.points).map((seg, i) =>
                  seg.length > 1 ? (
                    <polyline
                      key={`${s.id}-${i}`}
                      points={seg.map((p) => `${x(p.ts).toFixed(1)},${y(p[metric]).toFixed(1)}`).join(' ')}
                      fill="none"
                      stroke={s.color}
                      strokeWidth="1.75"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ) : null,
                ),
              )}
            </g>

            {hoverX != null && (
              <g pointerEvents="none">
                <line x1={hoverX} x2={hoverX} y1={PAD.top} y2={PAD.top + innerH} stroke="#71717a" strokeWidth="1" />
                {readout.map((s) => s.point && (
                  <circle key={s.id} cx={x(s.point.ts)} cy={y(s.point[metric])} r="3.5" fill={s.color} stroke="#09090b" strokeWidth="1.5" />
                ))}
              </g>
            )}
          </svg>
        )}

        {hoverX != null && readout && (
          <div
            className="pointer-events-none absolute top-1 z-10 min-w-40 rounded-lg border border-zinc-700 bg-zinc-900/95 px-3 py-2 text-xs shadow-xl"
            style={hoverX > width / 2 ? { right: width - hoverX + 10 } : { left: hoverX + 10 }}
          >
            <div className="mb-1 text-zinc-400 tabular">{formatClock(hoverTs)}</div>
            {readout.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-zinc-300">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.name}
                </span>
                <span className="font-mono tabular text-zinc-100">{s.point ? formatMetric(metric, s.point[metric]) : '–'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
