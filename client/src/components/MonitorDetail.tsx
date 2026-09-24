import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import type { Check, Monitor, MonitorEvent } from '../types'
import { fmtDuration, fmtRelative, fmtTime, fmtUptime } from '../utils'
import StatusBadge from './StatusBadge'

interface Props {
  id: number
  onBack: () => void
  onNotice: (msg: string) => void
}

export default function MonitorDetail({ id, onBack, onNotice }: Props) {
  const [monitor, setMonitor] = useState<Monitor | null>(null)
  const [checks, setChecks] = useState<Check[]>([])
  const [events, setEvents] = useState<MonitorEvent[]>([])
  const [notFound, setNotFound] = useState(false)

  const load = useCallback(async () => {
    try {
      const [m, c, e] = await Promise.all([
        api.monitor(id),
        api.checks(id, 240),
        api.events(id),
      ])
      setMonitor(m)
      setChecks(c.checks)
      setEvents(e.events)
    } catch {
      setNotFound(true)
    }
  }, [id])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 10_000)
    return () => clearInterval(t)
  }, [load])

  if (notFound) {
    return (
      <div>
        <button className="btn ghost" onClick={onBack}>
          ← Back
        </button>
        <p className="sub">Monitor not found.</p>
      </div>
    )
  }

  if (!monitor) return <div className="boot">Loading…</div>

  const ongoing = monitor.status === 'down' && monitor.lastDownAt !== null

  return (
    <div>
      <button className="btn ghost" onClick={onBack}>
        ← Back to monitors
      </button>

      <div className="page-head">
        <div>
          <h1>
            {monitor.name} <StatusBadge status={monitor.status} />
          </h1>
          <p className="sub mono">{monitor.url}</p>
        </div>
      </div>

      <div className="cards">
        <div className="stat">
          <div className="stat-label">Uptime 24h</div>
          <div className="stat-value">{fmtUptime(monitor.uptime['24h'])}</div>
        </div>
        <div className="stat">
          <div className="stat-label">7 days</div>
          <div className="stat-value">{fmtUptime(monitor.uptime['7d'])}</div>
        </div>
        <div className="stat">
          <div className="stat-label">30 days</div>
          <div className="stat-value">{fmtUptime(monitor.uptime['30d'])}</div>
        </div>
        <div className="stat">
          <div className="stat-label">90 days</div>
          <div className="stat-value">{fmtUptime(monitor.uptime['90d'])}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Latency</div>
          <div className="stat-value">
            {monitor.lastLatencyMs !== null ? `${monitor.lastLatencyMs} ms` : '—'}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">{ongoing ? 'Down for' : 'Last checked'}</div>
          <div className="stat-value">
            {ongoing && monitor.lastDownAt
              ? fmtDuration(Date.now() - monitor.lastDownAt)
              : monitor.lastCheckedAt
                ? fmtRelative(monitor.lastCheckedAt)
                : 'never'}
          </div>
        </div>
      </div>

      <h3 className="section-title">Recent checks</h3>
      <div className="card">
        <div className="sparkline" title="Each bar is one check, oldest on the left">
          {checks
            .slice()
            .reverse()
            .map((c) => (
              <span
                key={c.id}
                className={c.status === 'ok' ? 'bar ok' : 'bar fail'}
                title={`${fmtTime(c.checked_at)} — ${c.status === 'ok' ? 'OK' : 'FAIL'}${
                  c.status_code ? ` (HTTP ${c.status_code})` : ''
                }${c.latency_ms !== null ? ` · ${c.latency_ms} ms` : ''}`}
              />
            ))}
          {checks.length === 0 && <span className="muted">No checks recorded yet.</span>}
        </div>
        <div className="spark-legend">
          <span>{checks.length} checks shown</span>
          <span className="muted">hover a bar for details</span>
        </div>
      </div>

      <h3 className="section-title">
        Incidents <span className="muted">({events.length})</span>
      </h3>
      <div className="card">
        {events.length === 0 ? (
          <p className="muted">No incidents. 🎉</p>
        ) : (
          events.map((e) => (
            <div key={e.id} className="incident">
              <span className={e.kind === 'DOWN' ? 'dot red' : 'dot green'} />
              <div>
                <div>{e.message}</div>
                <div className="muted small">
                  {fmtTime(e.started_at)} ·{' '}
                  {e.resolved_at
                    ? `resolved after ${fmtDuration(e.resolved_at - e.started_at)}`
                    : 'ongoing'}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <p className="hint">
        Config: checks every {monitor.intervalSec}s · timeout {monitor.timeoutMs}ms · expects HTTP{' '}
        {monitor.expectedStatus} · method {monitor.method}
      </p>
      <button
        className="btn ghost danger"
        style={{ marginTop: 12 }}
        onClick={async () => {
          if (!confirm(`Delete monitor "${monitor.name}"?`)) return
          await api.deleteMonitor(monitor.id)
          onNotice(`Monitor "${monitor.name}" deleted`)
          onBack()
        }}
      >
        Delete this monitor
      </button>
    </div>
  )
}