export type Status = 'up' | 'down' | 'unknown' | 'paused'
export type UptimeWindow = '24h' | '7d' | '30d' | '90d'

export interface Monitor {
  id: number
  name: string
  url: string
  method: 'GET' | 'HEAD' | 'POST'
  expectedStatus: number
  intervalSec: number
  timeoutMs: number
  enabled: boolean
  status: Status
  lastCheckedAt: number | null
  lastDownAt: number | null
  lastLatencyMs: number | null
  lastStatusCode: number | null
  uptime: Partial<Record<UptimeWindow, number | null>>
  createdAt: string
  updatedAt: string
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

export interface Check {
  id: number
  monitor_id: number
  status: 'ok' | 'fail'
  latency_ms: number | null
  status_code: number | null
  checked_at: number
}

export interface MonitorEvent {
  id: number
  monitor_id: number
  kind: string
  message: string
  started_at: number
  resolved_at: number | null
}

export interface Webhook {
  id: string
  name: string
  url: string
}

export interface EmailSettings {
  enabled: boolean
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
  to: string
}

export interface Settings {
  page: {
    title: string
    description: string
    theme: 'dark' | 'light'
  }
  notifications: {
    webhooks: Webhook[]
    email: EmailSettings
  }
}