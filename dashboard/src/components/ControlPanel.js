'use client';

import { useState } from 'react';

const ACTIONS = [
  { scenario: 'spike', style: 'border-amber-500/40 text-amber-200 hover:bg-amber-500/15', icon: '↗' },
  { scenario: 'failure', style: 'border-red-500/40 text-red-200 hover:bg-red-500/15', icon: '✕' },
  { scenario: 'leak', style: 'border-fuchsia-500/40 text-fuchsia-200 hover:bg-fuchsia-500/15', icon: '◔' },
  { scenario: 'recover', style: 'border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/15', icon: '↺' },
];

export default function ControlPanel({ services, catalog, scenarios, onScenario }) {
  const [target, setTarget] = useState('payments');
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  const run = async (scenario) => {
    setBusy(scenario);
    setMessage(null);
    try {
      await onScenario(target, scenario);
      const who = target === 'all' ? 'all services' : services.find((s) => s.id === target)?.name;
      setMessage({ ok: true, text: `${catalog[scenario]?.label ?? scenario} applied to ${who}.` });
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setBusy(null);
    }
  };

  const activeCount = Object.values(scenarios).filter((s) => s && s !== 'normal').length;

  return (
    <section className="panel p-4" aria-labelledby="controls-title">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="controls-title" className="panel-title">Chaos controls</h2>
        {activeCount > 0 && (
          <span className="text-[11px] text-violet-300">{activeCount} scenario{activeCount === 1 ? '' : 's'} running</span>
        )}
      </div>

      <fieldset>
        <legend className="mb-2 text-xs text-zinc-400">Target</legend>
        <div className="flex flex-wrap gap-1.5">
          {[...services, { id: 'all', name: 'All services' }].map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setTarget(s.id)}
              aria-pressed={target === s.id}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                target === s.id
                  ? 'border-orange-500/60 bg-orange-500/15 text-orange-200'
                  : 'border-zinc-700 text-zinc-300 hover:border-zinc-500'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.scenario}
            type="button"
            disabled={busy != null}
            onClick={() => run(a.scenario)}
            title={catalog[a.scenario]?.description}
            className={`flex items-center gap-2 rounded-lg border bg-zinc-950/40 px-3 py-2.5 text-left text-sm font-medium transition-colors disabled:cursor-wait disabled:opacity-60 ${a.style}`}
          >
            <span aria-hidden="true" className="w-4 text-center">{a.icon}</span>
            {busy === a.scenario ? 'Applying…' : catalog[a.scenario]?.label ?? a.scenario}
          </button>
        ))}
      </div>

      <p className="mt-3 min-h-8 text-xs" role="status" aria-live="polite">
        {message ? (
          <span className={message.ok ? 'text-zinc-400' : 'text-red-300'}>{message.text}</span>
        ) : (
          <span className="text-zinc-500">Inject a fault, watch alerts fire, then recover the service.</span>
        )}
      </p>
    </section>
  );
}
