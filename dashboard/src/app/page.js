'use client';

import { useEffect, useMemo, useState } from 'react';
import { METRIC_KEYS, overallHealth, serviceHealth } from '@imd/core';
import { useMonitor, useNow } from '@/lib/useMonitor';
import { SERIES_COLORS } from '@/lib/format';
import Header from '@/components/Header';
import ServiceCard from '@/components/ServiceCard';
import MetricChart from '@/components/MetricChart';
import ControlPanel from '@/components/ControlPanel';
import RulesPanel from '@/components/RulesPanel';
import IncidentTable from '@/components/IncidentTable';
import WebhookLog from '@/components/WebhookLog';
import Toasts from '@/components/Toasts';

const REPO_URL = 'https://github.com/EthanYap123/incident-monitoring-dashboard';
const WINDOWS = [
  { ms: 2 * 60_000, label: '2m' },
  { ms: 5 * 60_000, label: '5m' },
  { ms: 10 * 60_000, label: '10m' },
];

function Banner({ mode, status }) {
  if (mode === 'demo') {
    return (
      <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-2.5 text-xs text-violet-200">
        <strong className="font-semibold">Demo mode.</strong> The telemetry simulator and alert engine are running in your browser.
        Run <code className="rounded bg-zinc-900 px-1 font-mono">docker compose up</code> for the full stack with the collector,
        PostgreSQL and webhook receiver.{' '}
        <a href={REPO_URL} className="font-medium underline underline-offset-2 hover:text-white" target="_blank" rel="noreferrer">
          View source
        </a>
      </div>
    );
  }
  if (status === 'offline' || status === 'reconnecting') {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-200" role="alert">
        Can’t reach the collector API. Is the Docker stack running?{' '}
        <a href="?mode=demo" className="font-medium underline underline-offset-2 hover:text-white">Open the in-browser demo instead</a>
      </div>
    );
  }
  return null;
}

function Skeleton() {
  return (
    <div className="grid animate-pulse grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => <div key={i} className="panel h-56" />)}
    </div>
  );
}

export default function DashboardPage() {
  const { state, mode, actions } = useMonitor();
  const now = useNow(1000);
  const [windowMs, setWindowMs] = useState(WINDOWS[1].ms);

  const unresolved = useMemo(() => state.incidents.filter((i) => i.status !== 'resolved'), [state.incidents]);
  const healths = Object.fromEntries(
    state.services.map((s) => [s.id, serviceHealth(s.id, unresolved, state.lastSeen[s.id], now)]),
  );
  const overall = state.ready ? overallHealth(Object.values(healths)) : 'healthy';
  const openCount = unresolved.length;

  useEffect(() => {
    document.title = openCount ? `(${openCount}) Incident Monitor` : 'Incident Monitor';
  }, [openCount]);

  return (
    <>
      <main className="mx-auto flex max-w-[1440px] flex-col gap-5 px-4 py-5 sm:px-6 lg:py-6">
        <Header overall={overall} status={state.status} openCount={openCount} now={now} />
        <Banner mode={mode} status={state.status} />

        {!state.ready ? (
          <Skeleton />
        ) : (
          <>
            <section aria-label="Service health" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {state.services.map((s, i) => {
                const history = state.history[s.id] ?? [];
                const scenario = state.scenarios[s.id];
                return (
                  <ServiceCard
                    key={s.id}
                    service={s}
                    color={SERIES_COLORS[i % SERIES_COLORS.length]}
                    health={healths[s.id]}
                    latest={history[history.length - 1]}
                    history={history}
                    scenario={scenario}
                    scenarioLabel={state.catalog[scenario]?.label ?? scenario}
                    rules={state.rules}
                  />
                );
              })}
            </section>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
              <section aria-labelledby="charts-title" className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 id="charts-title" className="panel-title">Live telemetry</h2>
                  <div className="flex items-center gap-3">
                    <ul className="hidden flex-wrap gap-3 text-[11px] text-zinc-400 md:flex">
                      {state.services.map((s, i) => (
                        <li key={s.id} className="flex items-center gap-1.5">
                          <span className="h-0.5 w-3 rounded" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                          {s.name}
                        </li>
                      ))}
                    </ul>
                    <div className="flex rounded-lg border border-zinc-800 bg-zinc-950/60 p-0.5 text-xs" role="group" aria-label="Chart time window">
                      {WINDOWS.map((w) => (
                        <button
                          key={w.ms}
                          type="button"
                          aria-pressed={windowMs === w.ms}
                          onClick={() => setWindowMs(w.ms)}
                          className={`rounded-md px-2.5 py-1 ${windowMs === w.ms ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}
                        >
                          {w.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {METRIC_KEYS.map((metric) => (
                    <MetricChart
                      key={metric}
                      metric={metric}
                      services={state.services}
                      history={state.history}
                      rule={state.rules.find((r) => r.metric === metric)}
                      windowMs={windowMs}
                      now={now}
                    />
                  ))}
                </div>
              </section>

              <aside className="flex min-w-0 flex-col gap-5">
                <ControlPanel
                  services={state.services}
                  catalog={state.catalog}
                  scenarios={state.scenarios}
                  onScenario={actions.setScenario}
                />
                <RulesPanel rules={state.rules} onSave={actions.updateRules} />
              </aside>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0">
                <IncidentTable incidents={state.incidents} now={now} onAcknowledge={actions.acknowledge} />
              </div>
              <WebhookLog deliveries={state.deliveries} urls={state.webhookUrls} now={now} />
            </div>
          </>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 pt-4 text-[11px] text-zinc-500">
          <span>
            Storage: {state.store === 'postgres' ? 'PostgreSQL' : state.store === 'browser' ? 'in-browser (demo)' : state.store ?? '–'}
            {' · '}Alerts: 2 breaching samples to open, 3 clear to resolve
          </span>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-zinc-300">
            Source on GitHub
          </a>
        </footer>
      </main>
      <Toasts toasts={state.toasts} onDismiss={actions.dismissToast} />
    </>
  );
}
