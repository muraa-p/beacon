export function fmtUptime(p: number | null | undefined): string {
  return p === null || p === undefined ? '—' : `${p.toFixed(2)}%`
}

export function fmtRelative(ts: number, now = Date.now()): string {
  const diff = now - ts
  if (diff < 10_000) return 'just now'
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
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

export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString()
}

export function parseDiagnosis(raw: string | null | undefined): {
  summary: string
  confidence: string
  attackFlagged: boolean
  tags: string[]
} | null {
  if (!raw) return null
  try {
    const d = JSON.parse(raw) as Record<string, unknown>
    if (typeof d.summary !== 'string') return null
    return {
      summary: d.summary,
      confidence: typeof d.confidence === 'string' ? d.confidence : 'medium',
      attackFlagged: d.attackFlagged === true,
      tags: Array.isArray(d.tags) ? d.tags.filter((t): t is string => typeof t === 'string') : [],
    }
  } catch {
    return null
  }
}