import path from 'node:path'

export interface Config {
  port: number
  dataDir: string
  dbPath: string
  adminUser: string
  adminPassword: string | undefined
  publicUrl: string
  checkerTickMs: number
}

function toInt(value: string | undefined, dflt: number): number {
  if (!value) return dflt
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : dflt
}

export function loadConfig(): Config {
  const env = process.env
  const dataDir = env.DATA_DIR ?? path.join(process.cwd(), 'data')
  return {
    port: toInt(env.PORT, 8080),
    dataDir,
    dbPath: path.join(dataDir, 'beacon.db'),
    adminUser: env.ADMIN_USER ?? 'admin',
    adminPassword: env.ADMIN_PASSWORD,
    publicUrl: (env.PUBLIC_URL ?? `http://localhost:${toInt(env.PORT, 8080)}`).replace(/\/+$/, ''),
    checkerTickMs: toInt(env.CHECKER_TICK_MS, 2000),
  }
}