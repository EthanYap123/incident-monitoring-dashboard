'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { createLiveSource } from './sources/live';
import { createDemoSource } from './sources/demo';

const KEEP_HISTORY_MS = 15 * 60_000;
const MAX_INCIDENTS = 200;
const MAX_DELIVERIES = 100;
const MAX_TOASTS = 4;

const initialState = {
  ready: false,
  status: 'connecting',
  services: [],
  catalog: {},
  rules: [],
  history: {}, // serviceId -> samples (oldest first)
  lastSeen: {}, // serviceId -> client clock time of the latest sample
  scenarios: {}, // serviceId -> scenario name
  incidents: [],
  deliveries: [],
  webhookUrls: [],
  store: null,
  toasts: [],
};

export function dataMode() {
  if (typeof window !== 'undefined') {
    const param = new URLSearchParams(window.location.search).get('mode');
    if (param === 'demo' || param === 'live') return param;
  }
  return process.env.NEXT_PUBLIC_DATA_MODE === 'demo' ? 'demo' : 'live';
}

function appendSamples(history, samples, cutoff) {
  const next = { ...history };
  for (const s of samples) {
    const list = next[s.service] ? [...next[s.service]] : [];
    // Ignore anything older than what we already have (e.g. a poll overlapping a push).
    if (list.length && list[list.length - 1].ts >= s.ts) continue;
    list.push(s);
    next[s.service] = list;
  }
  for (const id of Object.keys(next)) {
    const list = next[id];
    const firstKept = list.findIndex((s) => s.ts >= cutoff);
    if (firstKept > 0) next[id] = list.slice(firstKept);
  }
  return next;
}

function upsertIncident(list, incident) {
  const i = list.findIndex((x) => x.id === incident.id);
  const next = i === -1 ? [incident, ...list] : list.map((x, j) => (j === i ? incident : x));
  return next.sort((a, b) => b.openedAt - a.openedAt).slice(0, MAX_INCIDENTS);
}

let toastId = 0;

function reducer(state, action) {
  switch (action.type) {
    case 'status':
      return { ...state, status: action.status };

    case 'snapshot': {
      const s = action.snapshot;
      // Translate server timestamps to this browser's clock, so clock skew cannot mark services offline.
      const skew = Date.now() - s.serverTime;
      const history = {};
      for (const sample of s.samples) (history[sample.service] ??= []).push(sample);
      const lastSeen = {};
      const scenarios = {};
      for (const [id, list] of Object.entries(history)) {
        const last = list[list.length - 1];
        lastSeen[id] = last.ts + skew;
        scenarios[id] = last.scenario;
      }
      // When polling, incidents only arrive inside snapshots, so raise toasts for whatever changed.
      let toasts = state.toasts;
      if (state.ready) {
        const before = new Map(state.incidents.map((i) => [i.id, i]));
        for (const inc of s.incidents) {
          const prev = before.get(inc.id);
          const event = !prev ? (inc.status === 'resolved' ? null : 'opened')
            : prev.status !== 'resolved' && inc.status === 'resolved' ? 'resolved'
              : prev.severity !== inc.severity ? 'escalated' : null;
          if (event) toasts = [{ id: ++toastId, event, incident: inc }, ...toasts].slice(0, MAX_TOASTS);
        }
      }
      return {
        toasts,
        ...state,
        ready: true,
        services: s.services,
        catalog: s.scenarioCatalog,
        rules: s.rules,
        history,
        lastSeen,
        scenarios,
        incidents: [...s.incidents].sort((a, b) => b.openedAt - a.openedAt),
        deliveries: s.deliveries,
        webhookUrls: s.webhookUrls,
        store: s.store,
      };
    }

    case 'samples': {
      const now = Date.now();
      const lastSeen = { ...state.lastSeen };
      const scenarios = { ...state.scenarios };
      for (const s of action.samples) {
        lastSeen[s.service] = now;
        scenarios[s.service] = s.scenario;
      }
      return { ...state, history: appendSamples(state.history, action.samples, now - KEEP_HISTORY_MS), lastSeen, scenarios };
    }

    case 'incident': {
      const next = { ...state, incidents: upsertIncident(state.incidents, action.incident) };
      if (action.event === 'opened' || action.event === 'escalated' || action.event === 'resolved') {
        const toast = { id: ++toastId, event: action.event, incident: action.incident };
        next.toasts = [toast, ...state.toasts].slice(0, MAX_TOASTS);
      }
      return next;
    }

    case 'webhook':
      if (state.deliveries.some((d) => d.id === action.delivery.id)) return state;
      return { ...state, deliveries: [action.delivery, ...state.deliveries].slice(0, MAX_DELIVERIES) };

    case 'rules':
      return { ...state, rules: action.rules };

    case 'scenarios': {
      const scenarios = { ...state.scenarios };
      for (const [id, value] of Object.entries(action.scenarios)) scenarios[id] = value.scenario;
      return { ...state, scenarios };
    }

    case 'dismissToast':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };

    default:
      return state;
  }
}

export function useMonitor() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [mode, setMode] = useState(null);
  const sourceRef = useRef(null);

  useEffect(() => {
    const m = dataMode();
    setMode(m);
    const source = m === 'demo' ? createDemoSource() : createLiveSource();
    sourceRef.current = source;
    const disconnect = source.connect(
      (message) => {
        if (message.type === 'snapshot') dispatch({ type: 'snapshot', snapshot: message.snapshot });
        else dispatch(message);
      },
      (status) => dispatch({ type: 'status', status }),
    );
    return disconnect;
  }, []);

  const actions = {
    setScenario: useCallback((service, scenario) => sourceRef.current.setScenario(service, scenario), []),
    acknowledge: useCallback((id) => sourceRef.current.acknowledge(id), []),
    updateRules: useCallback((rules) => sourceRef.current.updateRules(rules), []),
    dismissToast: useCallback((id) => dispatch({ type: 'dismissToast', id }), []),
  };

  return { state, mode, actions };
}

/** Re-renders every `ms` so durations and offline detection stay current between updates. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}
