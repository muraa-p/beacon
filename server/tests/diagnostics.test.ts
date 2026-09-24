import { describe, expect, it } from 'vitest'
import { summarize, type Finding } from '../src/diagnostics.js'

function finding(stage: Finding['stage'], ok: boolean | null, detail = ''): Finding {
  return { stage, ok, detail }
}

const baseFindings = (overrides: Partial<Record<Finding['stage'], Finding>> = {}): Finding[] => {
  const all: Finding[] = [
    finding('dns', true, 'Resolves to 1.2.3.4 (IPv4)'),
    finding('tls', true, 'TLS handshake OK (TLSv1.3, cert expires in 300 day(s))'),
    finding('http', false, 'HTTP 500'),
    finding('recovery', false, 'timeout'),
    finding('pattern', null, 'Recent success rate before the failure: 100%'),
  ]
  return all.map((f) => overrides[f.stage] ?? f)
}

describe('summarize', () => {
  const ctx = {
    flapping: false,
    httpStatus: 500,
    httpTimeout: false,
    recoveryOk: false,
  }

  it('flags DNS failure as a high-confidence DNS/registrar issue', () => {
    const findings = baseFindings({ dns: finding('dns', false, 'DNS lookup failed: ENOTFOUND') })
    const r = summarize(findings, ctx)
    expect(r.summary).toContain('DNS')
    expect(r.confidence).toBe('high')
    expect(r.attackFlagged).toBe(false)
  })

  it('diagnoses certificate errors on TLS rejection', () => {
    const findings = baseFindings({ tls: finding('tls', false, 'TLS error: CERT_HAS_EXPIRED') })
    const r = summarize(findings, { ...ctx, httpStatus: null })
    expect(r.summary).toMatch(/certificate/i)
    expect(r.confidence).toBe('high')
  })

  it('warns about certificates expiring within 14 days', () => {
    const findings = baseFindings({ tls: finding('tls', true, 'TLS handshake OK (cert expires in 5 day(s))') })
    const r = summarize(findings, { ...ctx, certDays: 5, httpStatus: null })
    expect(r.summary).toContain('5 day(s)')
  })

  it('flags HTTP 403 as a possible attack (WAF/CDN challenge)', () => {
    const findings = baseFindings({ http: finding('http', false, 'HTTP 403') })
    const r = summarize(findings, { ...ctx, httpStatus: 403 })
    expect(r.attackFlagged).toBe(true)
    expect(r.summary).toContain('403')
  })

  it('reports 5xx as an application-level error', () => {
    const r = summarize(baseFindings(), ctx)
    expect(r.summary).toContain('HTTP 500')
    expect(r.confidence).toBe('high')
    expect(r.attackFlagged).toBe(false)
  })

  it('calls out timeouts as a hang/firewall problem', () => {
    const findings = baseFindings({ http: finding('http', false, 'timeout') })
    const r = summarize(findings, { ...ctx, httpStatus: null, httpTimeout: true })
    expect(r.summary).toMatch(/did not answer in time/i)
  })

  it('flags flapping as a possible DDoS/throttling pattern', () => {
    const findings = baseFindings({ pattern: finding('pattern', null, 'Rapid down/up flapping detected') })
    const r = summarize(findings, { ...ctx, flapping: true })
    expect(r.attackFlagged).toBe(true)
    expect(r.summary).toMatch(/flapping/i)
  })

  it('notes transient recovery when the follow-up probe succeeds', () => {
    const findings = baseFindings({ recovery: finding('recovery', true, 'HTTP 200') })
    const r = summarize(findings, { ...ctx, recoveryOk: true })
    expect(r.summary).toMatch(/transient/i)
  })

  it('falls back to a network-layer explanation for refused connections', () => {
    const findings = baseFindings({
      http: finding('http', false, 'fetch failed: connect ECONNREFUSED 1.2.3.4:443'),
    })
    const r = summarize(findings, { ...ctx, httpStatus: null })
    expect(r.summary).toMatch(/refused/i)
    expect(r.confidence).toBe('medium')
  })
})