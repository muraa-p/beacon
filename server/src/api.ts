import express, { type Router } from 'express'
import { asRow, asRows, type BeaconDB } from './db.js'
import {
  clearSessionCookie,
  createSession,
  currentUser,
  destroySession,
  parseCookies,
  requireAuth,
  setSessionCookie,
  SESSION_COOKIE,
  verifyLogin,
} from './auth.js'
import { getRuntimeState, rescheduleMonitor, type MonitorRow } from './checker.js'
import { getSettings, saveSettings } from './settings.js'
import { isHttpUrl, UPTIME_WINDOWS, uptimePercent, type CheckRow, type UptimeWindow } from './utils.js'

function monitorPayload(body: unknown): { error?: string; value?: MonitorInput } {
  if (!body || typeof body !== 'object') return { error: 'Invalid payload' }
  const b = body as Record<string, unknown>
  const name = typeof b.name === 'string' ? b.name.trim() : ''

  const url = typeof b.url === 'string' ? b.url.trim() : ''
  const method = b.method === 'HEAD' || b.method === 'POST' ? b.method : 'GET'
  const toInt = (v: unknown, fallback: number, min: number, max: number): number => {
    const n = typeof v === 'number' ? Math.round(v) : Number.NaN
    if (!Number.isFinite(n)) return fallback
    return Math.min(max, Math.max(min, n))
  }
  const expectedStatus = toInt(b.expectedStatus, 200, 100, 599)
  const intervalSec = toInt(b.intervalSec, 60, 10, 86_400)
  const timeoutMs = toInt(b.timeoutMs, 10_000, 500, 120_000)
  const enabled = b.enabled !== false

  if (!name || name.length > 100) return { error: 'name must be 1-100 characters' }
  if (!isHttpUrl(url)) return { error: 'url must be a valid http(s) URL' }

  return {
    value: { name, url, method, expectedStatus, intervalSec, timeoutMs, enabled },
  }
}

export interface MonitorInput {
  name: string
  url: string
  method: 'GET' | 'HEAD' | 'POST'
  expectedStatus: number
  intervalSec: number
  timeoutMs: number
  enabled: boolean
}

export interface MonitorApi extends MonitorInput {
  id: number
  status: 'up' | 'down' | 'unknown' | 'paused'
  lastCheckedAt: number | null
  lastDownAt: number | null
  lastLatencyMs: number | null
  lastStatusCode: number | null
  uptime: Partial<Record<UptimeWindow, number | null>>
  createdAt: string
  updatedAt: string
}

function serializeMonitor(db: BeaconDB, m: MonitorRow): MonitorApi {
  const rs = getRuntimeState(m.id)
  const now = Date.now()
  const checks = asRows<CheckRow>(
    db
      .prepare(
        'SELECT status, latency_ms, checked_at FROM checks WHERE monitor_id = ? AND checked_at >= ? ORDER BY checked_at ASC',
      )
      .all(m.id, now - 90 * 24 * 3600 * 1000),
  )
  const uptime: Partial<Record<UptimeWindow, number | null>> = {}
  for (const w of UPTIME_WINDOWS) uptime[w.key] = uptimePercent(checks, w.ms, now)
  return {
    id: m.id,
    name: m.name,
    url: m.url,
    method: m.method as MonitorInput['method'],
    expectedStatus: m.expected_status,
    intervalSec: m.interval_sec,
    timeoutMs: m.timeout_ms,
    enabled: m.enabled === 1,
    status: m.enabled === 0 ? 'paused' : rs.status,
    lastCheckedAt: rs.lastCheckedAt,
    lastDownAt: rs.lastDownAt,
    lastLatencyMs: rs.lastLatencyMs,
    lastStatusCode: rs.lastStatusCode,
    uptime,
    createdAt: m.created_at,
    updatedAt: m.updated_at,
  }
}

const parseId = (value: string): number | null => {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function apiRouter(db: BeaconDB): Router {
  const router = express.Router()

  // ---- public ----
  router.get('/public/status', (_req, res) => {
    const settings = getSettings(db)
    const monitors = asRows<MonitorRow>(db.prepare('SELECT * FROM monitors WHERE enabled = 1 ORDER BY name').all())
    const now = Date.now()
    const data = monitors.map((m) => {
      const rs = getRuntimeState(m.id)
      const checks = asRows<CheckRow>(
        db
          .prepare(
            'SELECT status, latency_ms, checked_at FROM checks WHERE monitor_id = ? AND checked_at >= ? ORDER BY checked_at ASC',
          )
          .all(m.id, now - 90 * 24 * 3600 * 1000),
      )
      const uptime: Partial<Record<UptimeWindow, number | null>> = {}
      for (const w of UPTIME_WINDOWS) uptime[w.key] = uptimePercent(checks, w.ms, now)
      return {
        id: m.id,
        name: m.name,
        url: m.url,
        status: rs.status,
        lastCheckedAt: rs.lastCheckedAt,
        lastLatencyMs: rs.lastLatencyMs,
        uptime,
      }
    })
    const incidents = db
      .prepare(
        `SELECT e.id, e.kind, e.message, e.started_at, e.resolved_at, m.name AS monitor_name
         FROM events e JOIN monitors m ON m.id = e.monitor_id
         WHERE m.enabled = 1 ORDER BY e.started_at DESC LIMIT 30`,
      )
      .all() as { id: number; kind: string; message: string; started_at: number; resolved_at: number | null; monitor_name: string }[]
    res.json({
      title: settings.page.title,
      description: settings.page.description,
      generatedAt: now,
      monitors: data,
      incidents,
    })
  })

  // ---- auth ----
  router.post('/login', (req, res) => {
    const body = (req.body ?? {}) as { username?: unknown; password?: unknown }
    const username = typeof body.username === 'string' ? body.username : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (!username || !password) {
      res.status(400).json({ error: 'Missing username or password' })
      return
    }
    if (!verifyLogin(db, username, password)) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }
    const token = createSession(db, username)
    setSessionCookie(res, token)
    res.json({ ok: true, username })
  })

  router.post('/logout', (req, res) => {
    const token = parseCookies(req)[SESSION_COOKIE]
    if (token) destroySession(db, token)
    clearSessionCookie(res)
    res.json({ ok: true })
  })

  router.get('/me', (req, res) => {
    const user = currentUser(db, req)
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    res.json({ username: user })
  })

  // ---- protected (everything registered below requires a session) ----
  const auth = requireAuth(db)
  router.use(auth)

  router.get('/monitors', (_req, res) => {
    const monitors = asRows<MonitorRow>(db.prepare('SELECT * FROM monitors ORDER BY name').all())
    res.json(monitors.map((m) => serializeMonitor(db, m)))
  })

  router.post('/monitors', (req, res) => {
    const parsed = monitorPayload(req.body)
    if (parsed.error || !parsed.value) {
      res.status(400).json({ error: parsed.error ?? 'Invalid payload' })
      return
    }
    const v = parsed.value
    const now = new Date().toISOString()
    const result = db
      .prepare(
        `INSERT INTO monitors (name, url, method, expected_status, interval_sec, timeout_ms, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(v.name, v.url, v.method, v.expectedStatus, v.intervalSec, v.timeoutMs, v.enabled ? 1 : 0, now, now)
    const id = Number(result.lastInsertRowid)
    rescheduleMonitor(id)
    const row = asRow<MonitorRow>(db.prepare('SELECT * FROM monitors WHERE id = ?').get(id))
    res.status(201).json(serializeMonitor(db, row))
  })

  router.put('/monitors/:id', (req, res) => {
    const id = parseId(req.params.id)
    if (!id) {
      res.status(400).json({ error: 'Invalid id' })
      return
    }
    const existing = db.prepare('SELECT * FROM monitors WHERE id = ?').get(id) as MonitorRow | undefined
    if (!existing) {
      res.status(404).json({ error: 'Monitor not found' })
      return
    }
    const parsed = monitorPayload({ ...existing, ...req.body })
    if (parsed.error || !parsed.value) {
      res.status(400).json({ error: parsed.error ?? 'Invalid payload' })
      return
    }
    const v = parsed.value
    db.prepare(
      `UPDATE monitors SET name = ?, url = ?, method = ?, expected_status = ?, interval_sec = ?, timeout_ms = ?, enabled = ?, updated_at = ? WHERE id = ?`,
    ).run(v.name, v.url, v.method, v.expectedStatus, v.intervalSec, v.timeoutMs, v.enabled ? 1 : 0, new Date().toISOString(), id)
    rescheduleMonitor(id)
    const row = asRow<MonitorRow>(db.prepare('SELECT * FROM monitors WHERE id = ?').get(id))
    res.json(serializeMonitor(db, row))
  })

  router.delete('/monitors/:id', (req, res) => {
    const id = parseId(req.params.id)
    if (!id) {
      res.status(400).json({ error: 'Invalid id' })
      return
    }
    db.prepare('DELETE FROM monitors WHERE id = ?').run(id)
    db.prepare('DELETE FROM checks WHERE monitor_id = ?').run(id)
    db.prepare('DELETE FROM events WHERE monitor_id = ?').run(id)
    res.json({ ok: true })
  })

  router.get('/monitors/:id', (req, res) => {
    const id = parseId(req.params.id)
    if (!id) {
      res.status(400).json({ error: 'Invalid id' })
      return
    }
    const row = db.prepare('SELECT * FROM monitors WHERE id = ?').get(id) as MonitorRow | undefined
    if (!row) {
      res.status(404).json({ error: 'Monitor not found' })
      return
    }
    res.json(serializeMonitor(db, row))
  })

  router.get('/monitors/:id/checks', (req, res) => {
    const id = parseId(req.params.id)
    if (!id) {
      res.status(400).json({ error: 'Invalid id' })
      return
    }
    const limitRaw = Number.parseInt(String(req.query.limit ?? '100'), 10)
    const limit = Math.min(500, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 100))
    const checks = db
      .prepare('SELECT * FROM checks WHERE monitor_id = ? ORDER BY checked_at DESC, id DESC LIMIT ?')
      .all(id, limit) as { id: number; monitor_id: number; status: string; latency_ms: number | null; status_code: number | null; checked_at: number }[]
    res.json({ checks })
  })

  router.get('/monitors/:id/events', (req, res) => {
    const id = parseId(req.params.id)
    if (!id) {
      res.status(400).json({ error: 'Invalid id' })
      return
    }
    const events = db
      .prepare('SELECT * FROM events WHERE monitor_id = ? ORDER BY started_at DESC, id DESC LIMIT 100')
      .all(id) as { id: number; monitor_id: number; kind: string; message: string; started_at: number; resolved_at: number | null }[]
    res.json({ events })
  })

  router.get('/settings', (_req, res) => {
    res.json(getSettings(db))
  })

  router.put('/settings', (req, res) => {
    const merged = saveSettings(db, req.body)
    res.json(merged)
  })

  return router
}