import dns from 'node:dns/promises'
import tls from 'node:tls'
import type { BeaconDB } from './db.js'
import type { MonitorRow } from './checker.js'

export type FindingStage = 'dns' | 'tls' | 'http' | 'recovery' | 'pattern'

export interface Finding {
  stage: FindingStage
  ok: boolean | null
  detail: string
}

export interface Diagnosis {
  generatedAt: number
  summary: string
  confidence: 'high' | 'medium' | 'low'
  attackFlagged: boolean
  tags: string[]
  findings: Finding[]
  report: string | null
}

async function probeDns(host: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const { address, family } = await dns.lookup(host)
    return { ok: true, detail: `Resolves to ${address} (IPv${family})` }
  } catch (err) {
    return { ok: false, detail: `DNS lookup failed: ${(err as Error).message}` }
  }
}

function probeTls(
  host: string,
  port: number,
): Promise<{ ok: boolean; detail: string; certDays?: number }> {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port, servername: host, timeout: 4000 }, () => {
      let certDays: number | undefined
      const cert = socket.getPeerCertificate(true)
      if (cert && 'valid_to' in cert && cert.valid_to) {
        certDays = Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86_400_000)
      }
      const proto = socket.getProtocol() ?? 'TLS'
      socket.end()
      resolve({
        ok: true,
        detail: `TLS handshake OK (${proto}${certDays !== undefined ? `, cert expires in ${certDays} day(s)` : ''})`,
        certDays,
      })
    })
    socket.on('error', (err) => {
      const e = err as NodeJS.ErrnoException
      resolve({ ok: false, detail: `TLS error: ${e.code ?? e.message}` })
    })
    socket.on('timeout', () => {
      socket.destroy()
      resolve({ ok: false, detail: 'TLS connection timed out' })
    })
  })
}

interface HttpProbe {
  ok: boolean
  status: number | null
  detail: string
}

async function probeHttp(url: string, timeoutMs: number): Promise<HttpProbe> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal })
    return { ok: res.ok, status: res.status, detail: `HTTP ${res.status}` }
  } catch (err) {
    const e = err as Error
    if (e.name === 'AbortError') return { ok: false, status: null, detail: 'timeout' }
    return { ok: false, status: null, detail: e.message }
  } finally {
    clearTimeout(timer)
  }
}

function analyzeHistory(db: BeaconDB, monitorId: number): { flapping: boolean; successRate: number } {
  const cutoff = Date.now() - 15 * 60_000
  const events = db
    .prepare('SELECT started_at FROM events WHERE monitor_id = ? AND kind = ? AND started_at >= ?')
    .all(monitorId, 'DOWN', cutoff) as { started_at: number }[]
  const recent = db
    .prepare('SELECT status FROM checks WHERE monitor_id = ? AND checked_at >= ? ORDER BY checked_at DESC LIMIT 20')
    .all(monitorId, cutoff) as { status: string }[]
  const okCount = recent.filter((c) => c.status === 'ok').length
  return { flapping: events.length >= 3, successRate: recent.length ? Math.round((okCount / recent.length) * 100) : 0 }
}

export interface SummarizeCtx {
  flapping: boolean
  certDays?: number
  httpStatus: number | null
  httpTimeout: boolean
  recoveryOk: boolean
}

/** Pure rule-based diagnosis — unit tested. */
export function summarize(
  findings: Finding[],
  ctx: SummarizeCtx,
): { summary: string; confidence: 'high' | 'medium' | 'low'; attackFlagged: boolean } {
  const by = (stage: FindingStage): Finding | undefined => findings.find((f) => f.stage === stage)
  const dnsF = by('dns')
  const tlsF = by('tls')
  const recF = by('recovery')
  const attackFlagged = ctx.httpStatus === 403 || ctx.flapping
  const parts: string[] = []
  let confidence: 'high' | 'medium' | 'low' = 'medium'

  if (dnsF && dnsF.ok === false) {
    parts.push('DNS resolution failed — this points at a DNS/registrar issue, not the web server itself.')
    confidence = 'high'
  } else if (tlsF && tlsF.ok === false) {
    if (/cert/i.test(tlsF.detail)) {
      parts.push('TLS handshake was rejected over a certificate problem — check validity, expiry, or a TLS-intercepting device.')
      confidence = 'high'
    } else {
      parts.push('The server did not complete a TLS handshake — check its certificate and TLS configuration.')
      confidence = 'medium'
    }
  } else if (ctx.certDays !== undefined && ctx.certDays < 14) {
    parts.push(`Certificate expires in ${ctx.certDays} day(s) — renew soon; some clients may start rejecting the handshake.`)
    confidence = 'medium'
  } else if (ctx.httpTimeout) {
    parts.push('The server did not answer in time — the app may be hung, overloaded, or a firewall is dropping packets.')
    confidence = 'medium'
  } else if (ctx.httpStatus === 403) {
    parts.push('The site answered HTTP 403 Forbidden. If that is unusual for it, a WAF/CDN challenge or blocking rule is likely — a possible attack signal.')
    confidence = 'high'
  } else if (ctx.httpStatus !== null && ctx.httpStatus >= 500) {
    parts.push(`The server is up but returning HTTP ${ctx.httpStatus} — this is an application-level error rather than an outage.`)
    confidence = 'high'
  } else if (ctx.httpStatus !== null) {
    parts.push(`The server answered HTTP ${ctx.httpStatus}, which differs from the expected status — check routing and health-check logic.`)
    confidence = 'medium'
  } else {
    parts.push('The connection failed or was refused at the network layer — the service may be down, or the firewall closed the port.')
    confidence = 'medium'
  }

  if (ctx.flapping) {
    parts.push('On-off flapping (repeated down/up in a short window) — consistent with connection-flood/DDoS or aggressive throttling.')
    confidence = 'medium'
  }
  if (recF && recF.ok === true) {
    parts.push('It recovered moments later — the failure looks transient.')
  }

  return { summary: parts.join(' '), confidence, attackFlagged }
}

export async function runDiagnostics(db: BeaconDB, monitor: MonitorRow): Promise<Diagnosis> {
  const url = new URL(monitor.url)
  const host = url.hostname
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
  const findings: Finding[] = []
  const tags: string[] = []

  const dnsR = await probeDns(host)
  findings.push({ stage: 'dns', ok: dnsR.ok, detail: dnsR.detail })

  let certDays: number | undefined
  if (url.protocol === 'https:') {
    const tlsR = await probeTls(host, port)
    findings.push({ stage: 'tls', ok: tlsR.ok, detail: tlsR.detail })
    certDays = tlsR.certDays
    if (certDays !== undefined && certDays < 14) tags.push('cert_expiring')
  }

  const httpR = await probeHttp(monitor.url, 3500)
  findings.push({ stage: 'http', ok: httpR.ok, detail: httpR.detail })

  const recR = await probeHttp(monitor.url, 2500)
  findings.push({ stage: 'recovery', ok: recR.ok, detail: recR.detail })

  const pattern = analyzeHistory(db, monitor.id)
  findings.push({
    stage: 'pattern',
    ok: null,
    detail: pattern.flapping ? 'Rapid down/up flapping detected' : `Recent success rate before the failure: ${pattern.successRate}%`,
  })

  const { summary, confidence, attackFlagged } = summarize(findings, {
    flapping: pattern.flapping,
    certDays,
    httpStatus: httpR.status,
    httpTimeout: httpR.detail === 'timeout',
    recoveryOk: recR.ok,
  })
  if (attackFlagged) tags.push('suspected_attack')
  if (httpR.status === 403) tags.push('http_403')

  const report = await llmReport(monitor, findings, summary, confidence)

  return { generatedAt: Date.now(), summary, confidence, attackFlagged, tags, findings, report }
}

/** Optional AI prose report. Only runs when OPENAI_API_KEY is configured — free by default. */
async function llmReport(
  monitor: MonitorRow,
  findings: Finding[],
  summary: string,
  confidence: string,
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.LLM_MODEL ?? 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You write concise incident reports for a status page. One short plain-language paragraph, no markdown.',
          },
          {
            role: 'user',
            content: `Monitor "${monitor.name}" (${monitor.url}) failed. Rule-based diagnosis: ${summary} (confidence ${confidence}). Evidence: ${findings
              .map((f) => `${f.stage}: ${f.detail}`)
              .join('; ')}. Write the incident report.`,
          },
        ],
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    return data.choices?.[0]?.message?.content?.trim() || null
  } catch {
    return null
  }
}