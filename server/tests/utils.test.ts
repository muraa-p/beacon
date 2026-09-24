import { describe, expect, it } from 'vitest'
import { fmtDuration, fmtUptime, isHttpUrl, uptimePercent, type CheckRow } from '../src/utils.js'

function makeChecks(pattern: string, base = Date.now()): CheckRow[] {
  return pattern.split('').map((ch, i) => ({
    status: ch === '1' ? 'ok' : 'fail',
    latency_ms: 100,
    checked_at: base - (pattern.length - i) * 60_000,
  }))
}

describe('uptimePercent', () => {
  it('returns null when there is no data in the window', () => {
    const base = Date.now() - 120_000 // all checks are ≥3 minutes old
    expect(uptimePercent(makeChecks('1111', base), 60_000)).toBeNull()
  })

  it('calculates percentage of successful checks', () => {
    const now = Date.now()
    const checks = makeChecks('11110000', now)
    expect(uptimePercent(checks, 24 * 3600 * 1000, now)).toBe(50)
  })

  it('returns 100 when all checks pass', () => {
    const now = Date.now()
    expect(uptimePercent(makeChecks('11111', now), 24 * 3600 * 1000, now)).toBe(100)
  })

  it('ignores checks older than the window', () => {
    const now = Date.now()
    const recent = makeChecks('11', now)
    const old: CheckRow[] = [{ status: 'fail', latency_ms: 0, checked_at: now - 10 * 24 * 3600 * 1000 }]
    expect(uptimePercent([...old, ...recent], 24 * 3600 * 1000, now)).toBe(100)
  })
})

describe('fmtUptime', () => {
  it('formats numbers and handles null', () => {
    expect(fmtUptime(null)).toBe('—')
    expect(fmtUptime(99.999)).toBe('100.00%')
    expect(fmtUptime(99.5)).toBe('99.50%')
  })
})

describe('fmtDuration', () => {
  it('formats ms, seconds, minutes, hours, days', () => {
    expect(fmtDuration(500)).toBe('500ms')
    expect(fmtDuration(5_000)).toBe('5s')
    expect(fmtDuration(125_000)).toBe('2m 5s')
    expect(fmtDuration(7_500_000)).toBe('2h 5m')
    expect(fmtDuration(90_000_000)).toBe('1d 1h')
  })
})

describe('isHttpUrl', () => {
  it('accepts http and https', () => {
    expect(isHttpUrl('https://example.com')).toBe(true)
    expect(isHttpUrl('http://localhost:3000/health')).toBe(true)
  })

  it('rejects other protocols and garbage', () => {
    expect(isHttpUrl('ftp://example.com')).toBe(false)
    expect(isHttpUrl('not a url')).toBe(false)
    expect(isHttpUrl('')).toBe(false)
  })
})