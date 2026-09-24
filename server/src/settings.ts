import type { BeaconDB } from './db.js'
import type { EmailSettings, Webhook } from './notify.js'

export interface PageSettings {
  title: string
  description: string
  theme: 'dark' | 'light'
}

export interface NotificationSettings {
  webhooks: Webhook[]
  email: EmailSettings
}

export interface AppSettings {
  page: PageSettings
  notifications: NotificationSettings
}

const DEFAULTS: AppSettings = {
  page: { title: 'All Systems Operational', description: '', theme: 'dark' },
  notifications: {
    webhooks: [],
    email: {
      enabled: false,
      host: '',
      port: 587,
      secure: false,
      user: '',
      pass: '',
      from: '',
      to: '',
    },
  },
}

export function getSettings(db: BeaconDB): AppSettings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const raw: Record<string, unknown> = {}
  for (const row of rows) {
    try {
      raw[row.key] = JSON.parse(row.value)
    } catch {
      // ignore corrupt values
    }
  }
  return deepMerge(structuredClone(DEFAULTS), raw) as AppSettings
}

export function saveSettings(db: BeaconDB, next: unknown): AppSettings {
  const patch = next && typeof next === 'object' ? (next as Record<string, unknown>) : {}
  const merged = deepMerge(structuredClone(DEFAULTS), patch) as AppSettings
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  )
  db.exec('BEGIN')
  try {
    for (const [key, value] of Object.entries(merged)) stmt.run(key, JSON.stringify(value))
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  return merged
}

function deepMerge(base: unknown, patch: unknown): unknown {
  if (Array.isArray(base)) return patch !== undefined ? patch : base
  if (base && typeof base === 'object' && patch && typeof patch === 'object') {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
    for (const key of Object.keys(patch as Record<string, unknown>)) {
      const patchValue = (patch as Record<string, unknown>)[key]
      out[key] =
        key in out && typeof out[key] === 'object' && out[key] !== null
          ? deepMerge(out[key], patchValue)
          : patchValue
    }
    return out
  }
  return patch !== undefined ? patch : base
}