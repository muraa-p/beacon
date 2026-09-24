import express, { type Router } from 'express'
import { asRows, type BeaconDB } from './db.js'
import { getRuntimeState, type MonitorRow } from './checker.js'
import { getSettings } from './settings.js'
import {
  fmtDuration,
  fmtRelative,
  fmtUptime,
  parseDiagnosis,
  UPTIME_WINDOWS,
  uptimePercent,
  type CheckRow,
  type UptimeWindow,
} from './utils.js'

export function statusPageRouter(db: BeaconDB): Router {
  const router = express.Router()

  router.get('/', (_req, res) => {
    const settings = getSettings(db)
    const monitors = asRows<MonitorRow>(
      db.prepare('SELECT * FROM monitors WHERE enabled = 1 ORDER BY name').all(),
    )
    const now = Date.now()

    const rows = monitors.map((m) => {
      const checks = asRows<CheckRow>(
        db
          .prepare(
            'SELECT status, latency_ms, checked_at FROM checks WHERE monitor_id = ? AND checked_at >= ? ORDER BY checked_at ASC',
          )
          .all(m.id, now - 90 * 24 * 3600 * 1000),
      )
      const rs = getRuntimeState(m.id)
      const uptime: Partial<Record<UptimeWindow, number | null>> = {}
      for (const w of UPTIME_WINDOWS) uptime[w.key] = uptimePercent(checks, w.ms, now)
      return {
        id: m.id,
        name: m.name,
        url: m.url,
        status: rs.status,
        latencyMs: rs.lastLatencyMs,
        checkedAt: rs.lastCheckedAt,
        uptime,
      }
    })

    const incidents = db
      .prepare(
        `SELECT e.id, e.kind, e.message, e.started_at, e.resolved_at, e.diagnosis, m.name AS monitor_name
         FROM events e JOIN monitors m ON m.id = e.monitor_id
         WHERE m.enabled = 1 ORDER BY e.started_at DESC LIMIT 30`,
      )
      .all() as {
      id: number
      kind: string
      message: string
      started_at: number
      resolved_at: number | null
      diagnosis: string | null
      monitor_name: string
    }[]

    const allUp = rows.length === 0 || rows.every((r) => r.status === 'up')
    res.type('html').send(renderStatusPage({ settings, rows, incidents, allUp, now }))
  })

  return router
}

interface RenderArgs {
  settings: ReturnType<typeof getSettings>
  rows: {
    id: number
    name: string
    url: string
    status: string
    latencyMs: number | null
    checkedAt: number | null
    uptime: Partial<Record<UptimeWindow, number | null>>
  }[]
  incidents: {
    id: number
    kind: string
    message: string
    started_at: number
    resolved_at: number | null
    diagnosis: string | null
    monitor_name: string
  }[]
  allUp: boolean
  now: number
}

function esc(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function renderStatusPage({ settings, rows, incidents, allUp, now }: RenderArgs): string {
  const dark = settings.page.theme !== 'light'
  const bg = dark ? '#0b0e14' : '#f6f8fa'
  const card = dark ? '#121722' : '#ffffff'
  const text = dark ? '#e6edf3' : '#1f2328'
  const muted = dark ? '#8b949e' : '#656d76'
  const border = dark ? '#21262d' : '#d0d7de'
  const green = '#2ea043'
  const red = '#f85149'
  const amber = '#d29922'

  const rowsHtml = rows
    .map((r) => {
      const color = r.status === 'up' ? green : r.status === 'down' ? red : amber
      const label = r.status === 'up' ? 'Operational' : r.status === 'down' ? 'Down' : 'Unknown'
      return `
      <div class="row">
        <div class="status"><span class="dot" style="background:${color}"></span>${label}</div>
        <div class="name">${esc(r.name)}</div>
        <div class="uptime">
          <span class="u">${fmtUptime(r.uptime['24h'])}</span>
          <span class="u">${fmtUptime(r.uptime['7d'])}</span>
          <span class="u">${fmtUptime(r.uptime['30d'])}</span>
          <span class="u">${fmtUptime(r.uptime['90d'])}</span>
        </div>
        <div class="meta">${r.latencyMs !== null ? `${r.latencyMs} ms` : '—'}${
          r.checkedAt ? ` · ${fmtRelative(r.checkedAt, now)}` : ''
        }</div>
      </div>`
    })
    .join('')

  const incidentsHtml =
    incidents.length === 0
      ? '<p class="empty">No incidents recorded.</p>'
      : incidents
          .map((e) => {
            const ongoing = e.resolved_at === null
            const color = e.kind === 'DOWN' ? red : green
            const dur = e.resolved_at === null ? 'ongoing' : fmtDuration(e.resolved_at - e.started_at)
            const diag = parseDiagnosis(e.diagnosis)
            return `
        <div class="incident">
          <span class="dot" style="background:${color}"></span>
          <div>
            <div class="incident-title">${esc(e.message)}</div>
            ${
              diag
                ? `<div class="incident-diag">🧠 ${esc(diag.summary)}${
                    diag.attackFlagged ? ' <span class="flag">⚠ possible attack</span>' : ''
                  }</div>`
                : ''
            }
            <div class="incident-meta">Started ${fmtRelative(e.started_at, now)} · ${
              ongoing ? 'Ongoing' : `resolved after ${dur}`
            }</div>
          </div>
        </div>`
          })
          .join('')

  const statusText = allUp ? settings.page.title : 'Some systems are experiencing issues'
  const statusColor = allUp ? green : red

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(settings.page.title)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; background: ${bg}; color: ${text};
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    line-height: 1.5;
  }
  .wrap { max-width: 860px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-size: 20px; font-weight: 600; margin: 0; }
  .banner {
    background: ${card}; border: 1px solid ${border}; border-left: 4px solid ${statusColor};
    border-radius: 10px; padding: 20px 24px; margin: 24px 0;
  }
  .banner h2 { margin: 0; font-size: 18px; color: ${statusColor}; }
  .banner p { margin: 6px 0 0; color: ${muted}; font-size: 14px; }
  .card {
    background: ${card}; border: 1px solid ${border}; border-radius: 10px;
    padding: 8px 24px; margin-bottom: 24px;
  }
  .head, .row {
    display: grid; grid-template-columns: 130px 1fr 220px 140px;
    align-items: center; gap: 12px; padding: 14px 0;
  }
  .head { color: ${muted}; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; border-bottom: 1px solid ${border}; }
  .row { border-bottom: 1px solid ${border}; font-size: 14px; }
  .row:last-child { border-bottom: none; }
  .status { display: flex; align-items: center; gap: 8px; font-weight: 500; }
  .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; flex: none; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .uptime { display: flex; gap: 8px; font-variant-numeric: tabular-nums; color: ${muted}; }
  .u { min-width: 52px; text-align: right; }
  .meta { text-align: right; color: ${muted}; font-size: 13px; }
  h3 { font-size: 14px; text-transform: uppercase; letter-spacing: .05em; color: ${muted}; margin: 32px 0 12px; }
  .incident { display: flex; gap: 12px; align-items: flex-start; padding: 12px 0; border-bottom: 1px solid ${border}; }
  .incident:last-child { border-bottom: none; }
  .incident .dot { margin-top: 6px; }
  .incident-title { font-size: 14px; }
  .incident-meta { font-size: 13px; color: ${muted}; }
  .incident-diag { font-size: 13px; color: ${muted}; margin-top: 4px; }
  .flag { color: ${amber}; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; }
  .empty { color: ${muted}; font-size: 14px; }
  footer { color: ${muted}; font-size: 13px; text-align: center; margin-top: 40px; }
  footer a { color: ${muted}; }
  @media (max-width: 720px) {
    .head { display: none; }
    .row { grid-template-columns: 1fr; gap: 6px; }
    .uptime { justify-content: flex-start; }
    .meta { text-align: left; }
  }
</style>
</head>
<body>
<div class="wrap">
  <h1>${esc(settings.page.title)}</h1>
  ${
    settings.page.description
      ? `<p style="color:${muted};font-size:14px">${esc(settings.page.description)}</p>`
      : ''
  }

  <div class="banner">
    <h2>${esc(statusText)}</h2>
    <p>${rows.length} service${rows.length === 1 ? '' : 's'} monitored · auto-refreshes every 60 seconds</p>
  </div>

  <div class="card">
    <div class="head">
      <div>Status</div>
      <div>Service</div>
      <div>Uptime 24h / 7d / 30d / 90d</div>
      <div style="text-align:right">Last check</div>
    </div>
    ${rowsHtml || '<p class="empty" style="padding:16px 0">No monitors configured yet.</p>'}
  </div>

  <h3>Recent incidents</h3>
  <div class="card">${incidentsHtml}</div>

  <footer>Powered by <a href="https://github.com/" rel="noopener">Beacon</a> · MIT licensed</footer>
</div>
<script>
  setTimeout(function () { location.reload() }, 60000)
</script>
</body>
</html>`
}