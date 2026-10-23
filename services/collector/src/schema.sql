-- Applied by the collector on start-up; every statement is idempotent.

CREATE TABLE IF NOT EXISTS metric_samples (
  ts          TIMESTAMPTZ NOT NULL,
  service     TEXT        NOT NULL,
  cpu         REAL        NOT NULL,
  memory      REAL        NOT NULL,
  error_rate  REAL        NOT NULL,
  latency_ms  REAL        NOT NULL,
  rps         REAL        NOT NULL,
  scenario    TEXT        NOT NULL DEFAULT 'normal'
);
CREATE INDEX IF NOT EXISTS metric_samples_ts_idx ON metric_samples (ts DESC);
CREATE INDEX IF NOT EXISTS metric_samples_service_ts_idx ON metric_samples (service, ts DESC);

CREATE TABLE IF NOT EXISTS incidents (
  id               TEXT PRIMARY KEY,
  seq              INTEGER     NOT NULL,
  service          TEXT        NOT NULL,
  metric           TEXT        NOT NULL,
  severity         TEXT        NOT NULL CHECK (severity IN ('warning', 'critical')),
  status           TEXT        NOT NULL CHECK (status IN ('open', 'acknowledged', 'resolved')),
  threshold        REAL        NOT NULL,
  value            REAL        NOT NULL,
  peak             REAL        NOT NULL,
  message          TEXT        NOT NULL,
  opened_at        TIMESTAMPTZ NOT NULL,
  acknowledged_at  TIMESTAMPTZ,
  resolved_at      TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS incidents_opened_idx ON incidents (opened_at DESC);
CREATE INDEX IF NOT EXISTS incidents_status_idx ON incidents (status);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id           BIGSERIAL PRIMARY KEY,
  event        TEXT        NOT NULL,
  incident_id  TEXT        NOT NULL,
  url          TEXT        NOT NULL,
  status_code  INTEGER,
  ok           BOOLEAN     NOT NULL,
  attempts     INTEGER     NOT NULL,
  duration_ms  INTEGER     NOT NULL,
  error        TEXT,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_deliveries_sent_idx ON webhook_deliveries (sent_at DESC);

CREATE TABLE IF NOT EXISTS alert_rules (
  metric    TEXT PRIMARY KEY,
  warning   REAL NOT NULL,
  critical  REAL NOT NULL
);
