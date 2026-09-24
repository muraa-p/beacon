export type CheckStatus = 'ok' | 'fail'

export interface CheckRow {
  status: CheckStatus
  latency_ms: number | null
  checked_at: number
}

export type UptimeWindow = '24h' | '7d' | '30d' | '90d'

export const UPTIME_WINDOWS: { key: UptimeWindow; ms: number }[] = [
  { key: '24h', ms: 24 * 3600 * 1000 },
  { key: '7d', ms: 7 * 24 * 3600 * 1000 },
  { key: '30d', ms: 30 * 24 * 3600 * 1000 },
  { key: '90d', ms: 90 * 24 * 3600 * 1000 },
]

/** Percentage of successful checks within the window, or null when no data. */
export function uptimePercent(checks: CheckRow[], windowMs: number, now = Date.now()): number | null {
  const inWindow = checks.filter((c) => c.checked_at >= now - windowMs)
  if (inWindow.length === 0) return null
  const ok = inWindow.filter((c) => c.status === 'ok').length
  return Math.round((ok / inWindow.length) * 10000) / 100
}

export function fmtUptime(p: number | null | undefined): string {
  return p === null || p === undefined ? '—' : `${p.toFixed(2)}%`
}

export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

export function fmtRelative(ts: number, now = Date.now()): string {
  const diff = now - ts
  if (diff < 0) return 'just now'
  if (diff < 10_000) return 'just now'
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}