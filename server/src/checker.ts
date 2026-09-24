import { getDB, asRows, asRow, type BeaconDB } from './db.js'
import { loadConfig } from './config.js'
import { sendNotifications } from './notify.js'
import { runDiagnostics } from './diagnostics.js'
import { fmtDuration } from './utils.js'

export interface MonitorRow {
  id: number
  name: string
  url: string
  method: string
  expected_status: number
  interval_sec: number
  timeout_ms: number
  enabled: number
  created_at: string
  updated_at: string
}

export interface MonitorState {
  status: 'up' | 'down' | 'unknown'
  lastCheckedAt: number | null
  lastDownAt: number | null
  lastLatencyMs: number | null
  lastStatusCode: number | null
}

const state = new Map<number, MonitorState>()
const nextCheckAt = new Map<number, number>()
const CONCURRENCY = 6
const PRUNE_PER_MONITOR = 2500

export function getRuntimeState(id: number): MonitorState {
  const existing = state.get(id)
  if (existing) return existing
  const fresh: MonitorState = {
    status: 'unknown',
    lastCheckedAt: null,
    lastDownAt: null,
    lastLatencyMs: null,
    lastStatusCode: null,
  }
  state.set(id, fresh)
  return fresh
}

/** Seed in-memory state from the database (used at startup). */
function seedRuntimeState(db: BeaconDB): void {
  const monitors = asRows<MonitorRow>(db.prepare('SELECT * FROM monitors').all())
  for (const m of monitors) {
    const latest = db
      .prepare(
        'SELECT status, latency_ms, status_code, checked_at FROM checks WHERE monitor_id = ? ORDER BY checked_at DESC, id DESC LIMIT 1',
      )
      .get(m.id) as { status: string; latency_ms: number | null; status_code: number | null; checked_at: number } | undefined
    const s: MonitorState = {
      status: latest ? (latest.status === 'ok' ? 'up' : 'down') : 'unknown',
      lastCheckedAt: latest?.checked_at ?? null,
      lastDownAt: null,
      lastLatencyMs: latest?.latency_ms ?? null,
      lastStatusCode: latest?.status_code ?? null,
    }
    if (s.status === 'down') {
      const open = db
        .prepare(
          'SELECT started_at FROM events WHERE monitor_id = ? AND kind = ? AND resolved_at IS NULL ORDER BY started_at DESC LIMIT 1',
        )
        .get(m.id, 'DOWN') as { started_at: number } | undefined
      s.lastDownAt = open?.started_at ?? latest?.checked_at ?? null
    }
    state.set(m.id, s)
  }
}

let timer: NodeJS.Timeout | null = null

export function startChecker(): void {
  const db = getDB()
  seedRuntimeState(db)
  const cfg = loadConfig()
  const monitors = asRows<MonitorRow>(db.prepare('SELECT * FROM monitors WHERE enabled = 1').all())
  const now = Date.now()
  monitors.forEach((m, i) => {
    const intervalMs = Math.max(10, m.interval_sec * 1000)
    nextCheckAt.set(m.id, now + Math.round((intervalMs * i) / Math.max(1, monitors.length)))
  })
  timer = setInterval(() => void tick(), cfg.checkerTickMs)
  void tick()
}

export function stopChecker(): void {
  if (timer) clearInterval(timer)
  timer = null
}

/** Called after create/update/delete so the schedule follows the database. */
export function rescheduleMonitor(id: number): void {
  const db = getDB()
  const m = db.prepare('SELECT * FROM monitors WHERE id = ?').get(id) as MonitorRow | undefined
  if (!m) return
  if (!m.enabled) {
    nextCheckAt.delete(id)
    return
  }
  nextCheckAt.set(id, Date.now() + Math.max(10, m.interval_sec * 1000))
}

async function tick(): Promise<void> {
  const db = getDB()
  const now = Date.now()
  const monitors = asRows<MonitorRow>(db.prepare('SELECT * FROM monitors WHERE enabled = 1').all())
  const due = monitors.filter((m) => (nextCheckAt.get(m.id) ?? 0) <= now)
  for (let i = 0; i < due.length; i += CONCURRENCY) {
    const chunk = due.slice(i, i + CONCURRENCY)
    await Promise.all(chunk.map((m) => runCheck(db, m)))
  }
}

async function runCheck(db: BeaconDB, monitor: MonitorRow): Promise<void> {
  const intervalMs = Math.max(10, monitor.interval_sec * 1000)
  nextCheckAt.set(monitor.id, Date.now() + intervalMs)

  const prev = { ...getRuntimeState(monitor.id) }
  const started = Date.now()
  let ok = false
  let statusCode: number | null = null
  let latencyMs: number | null = null
  let reason = 'Unknown error'

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), Math.max(500, monitor.timeout_ms))
    const res = await fetch(monitor.url, {
      method: monitor.method,
      redirect: 'follow',
      signal: controller.signal,
    })
    clearTimeout(timeout)
    statusCode = res.status
    latencyMs = Date.now() - started
    ok = res.status === monitor.expected_status
    if (!ok) reason = `Expected HTTP ${monitor.expected_status}, got ${res.status}`
  } catch (err) {
    latencyMs = Date.now() - started
    const e = err as Error
    if (e.name === 'AbortError') reason = `Timed out after ${monitor.timeout_ms}ms`
    else reason = e.message
  }

  db.prepare(
    'INSERT INTO checks (monitor_id, status, latency_ms, status_code, checked_at) VALUES (?, ?, ?, ?, ?)',
  ).run(monitor.id, ok ? 'ok' : 'fail', latencyMs, statusCode, Date.now())
  pruneChecks(db, monitor.id)

  const s = getRuntimeState(monitor.id)
  s.lastCheckedAt = Date.now()
  s.lastLatencyMs = latencyMs
  s.lastStatusCode = statusCode

  const newStatus: 'up' | 'down' = ok ? 'up' : 'down'
  if (prev.status !== newStatus) {
    s.status = newStatus
    const cfg = loadConfig()
    if (newStatus === 'down') {
      s.lastDownAt = Date.now()
      const result = db
        .prepare(
          'INSERT INTO events (monitor_id, kind, message, started_at, resolved_at, diagnosis) VALUES (?, ?, ?, ?, NULL, NULL)',
        )
        .run(monitor.id, 'DOWN', `${monitor.name} went DOWN — ${reason}`, Date.now())
      const eventId = Number(result.lastInsertRowid)
      // Run incident forensics off the hot path: DNS/TLS/HTTP probes, cert
      // expiry, flapping analysis. Store the diagnosis on the event, then
      // notify with a "what we think happened" report.
      void (async () => {
        try {
          const diag = await runDiagnostics(db, monitor)
          db.prepare('UPDATE events SET diagnosis = ? WHERE id = ?').run(JSON.stringify(diag), eventId)
          const attackNote = diag.attackFlagged ? ' ⚠ Possible attack pattern.' : ''
          const report = diag.report ? `\n\n${diag.report}` : ''
          await sendNotifications(
            db,
            cfg,
            'DOWN',
            monitor.name,
            `Reason: ${reason}\nURL: ${monitor.url}\n\nWhat we think happened: ${diag.summary}${attackNote}${report}`,
          )
        } catch (err) {
          console.warn('[diagnostics] failed:', (err as Error).message)
          await sendNotifications(db, cfg, 'DOWN', monitor.name, `Reason: ${reason}\nURL: ${monitor.url}`)
        }
      })()
    } else {
      const resolvedAt = Date.now()
      const open = db
        .prepare(
          'SELECT id, started_at FROM events WHERE monitor_id = ? AND kind = ? AND resolved_at IS NULL ORDER BY started_at DESC LIMIT 1',
        )
        .get(monitor.id, 'DOWN') as { id: number; started_at: number } | undefined
      if (open) {
        const duration = resolvedAt - open.started_at
        db.prepare('UPDATE events SET resolved_at = ? WHERE id = ?').run(resolvedAt, open.id)
        void sendNotifications(db, cfg, 'UP', monitor.name, `Back online after ${fmtDuration(duration)}`)
      } else if (prev.status !== 'unknown') {
        void sendNotifications(db, cfg, 'UP', monitor.name, 'Back online')
      }
      s.lastDownAt = null
    }
  }
}

function pruneChecks(db: BeaconDB, monitorId: number): void {
  const row = db.prepare('SELECT COUNT(*) AS n FROM checks WHERE monitor_id = ?').get(monitorId) as { n: number }
  if (row.n > PRUNE_PER_MONITOR) {
    db.prepare(
      'DELETE FROM checks WHERE monitor_id = ? AND id IN (SELECT id FROM checks WHERE monitor_id = ? ORDER BY checked_at DESC, id DESC LIMIT -1 OFFSET ?)',
    ).run(monitorId, monitorId, PRUNE_PER_MONITOR)
  }
}