'use client';

import { useEffect, useState } from 'react';
import { METRICS } from '@imd/core';

export default function RulesPanel({ rules, onSave }) {
  const [draft, setDraft] = useState(rules);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Follow rule changes made elsewhere (another tab or client) while not editing.
  useEffect(() => {
    if (!editing) setDraft(rules);
  }, [rules, editing]);

  const change = (metric, field, value) => {
    setEditing(true);
    setDraft((d) => d.map((r) => (r.metric === metric ? { ...r, [field]: value } : r)));
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(draft.map((r) => ({ metric: r.metric, warning: Number(r.warning), critical: Number(r.critical) })));
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setDraft(rules);
    setEditing(false);
    setError(null);
  };

  return (
    <section className="panel p-4" aria-labelledby="rules-title">
      <h2 id="rules-title" className="panel-title mb-3">Alert thresholds</h2>
      <form onSubmit={save}>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-zinc-500">
              <th className="pb-1.5 font-normal">Metric</th>
              <th className="pb-1.5 font-normal text-amber-300/80">Warning</th>
              <th className="pb-1.5 font-normal text-red-300/80">Critical</th>
            </tr>
          </thead>
          <tbody>
            {draft.map((r) => (
              <tr key={r.metric}>
                <td className="py-1 pr-2 text-zinc-300">
                  {METRICS[r.metric]?.label} <span className="text-zinc-500">({METRICS[r.metric]?.unit})</span>
                </td>
                {['warning', 'critical'].map((field) => (
                  <td key={field} className="py-1 pr-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      required
                      value={r[field]}
                      onChange={(e) => change(r.metric, field, e.target.value)}
                      aria-label={`${METRICS[r.metric]?.label} ${field} threshold`}
                      className="w-full min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono tabular text-zinc-100 focus:border-orange-500 focus:outline-none"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="min-w-0 text-[11px] text-zinc-500" role="status">
            {error ? <span className="text-red-300">{error}</span> : 'Breach for 2 samples opens; 3 clear samples resolve.'}
          </p>
          <div className="flex shrink-0 gap-2">
            {editing && (
              <button type="button" onClick={reset} className="rounded-md px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200">
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={!editing || saving}
              className="rounded-md bg-orange-500 px-3 py-1 text-xs font-semibold text-zinc-950 transition-opacity hover:bg-orange-400 disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
