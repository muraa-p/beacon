import crypto from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import type { BeaconDB } from './db.js'
import type { Config } from './config.js'

const ITERATIONS = 120_000
const SALT_BYTES = 16
const KEY_BYTES = 32

export const SESSION_COOKIE = 'beacon_token'
const SESSION_DAYS = 30

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_BYTES, 'sha256').toString('hex')
}

/** Creates the first admin account (prints credentials once) if none exists. */
export function ensureAdmin(db: BeaconDB, cfg: Config): void {
  const row = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }
  if (row.n > 0) return
  const username = cfg.adminUser
  const password = cfg.adminPassword ?? crypto.randomBytes(4).toString('hex')
  const salt = crypto.randomBytes(SALT_BYTES).toString('hex')
  db.prepare('INSERT INTO users (username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)').run(
    username,
    hashPassword(password, salt),
    salt,
    new Date().toISOString(),
  )
  console.log('==============================================================')
  console.log('  Beacon admin account created')
  console.log(`    username: ${username}`)
  console.log(`    password: ${password}`)
  console.log('  Set ADMIN_PASSWORD to choose your own on a fresh install.')
  console.log('==============================================================')
}

export function verifyLogin(db: BeaconDB, username: string, password: string): boolean {
  const user = db
    .prepare('SELECT password_hash, salt FROM users WHERE username = ?')
    .get(username) as { password_hash: string; salt: string } | undefined
  if (!user) return false
  const a = Buffer.from(hashPassword(password, user.salt), 'hex')
  const b = Buffer.from(user.password_hash, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function createSession(db: BeaconDB, username: string): string {
  const token = crypto.randomBytes(32).toString('hex')
  db.prepare('INSERT INTO sessions (token, username, created_at) VALUES (?, ?, ?)').run(
    token,
    username,
    new Date().toISOString(),
  )
  return token
}

export function destroySession(db: BeaconDB, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

export function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie ?? ''
  const out: Record<string, string> = {}
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim())
  }
  return out
}

export function setSessionCookie(res: Response, token: string): void {
  const maxAge = SESSION_DAYS * 24 * 3600
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax`)
}

export function clearSessionCookie(res: Response): void {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`)
}

export function currentUser(db: BeaconDB, req: Request): string | null {
  const token = parseCookies(req)[SESSION_COOKIE]
  if (!token) return null
  const row = db.prepare('SELECT username FROM sessions WHERE token = ?').get(token) as
    | { username: string }
    | undefined
  return row?.username ?? null
}

export function requireAuth(db: BeaconDB) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = currentUser(db, req)
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    res.locals.user = user
    next()
  }
}