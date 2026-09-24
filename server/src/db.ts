import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { loadConfig } from './config.js'

export type BeaconDB = DatabaseSync

/** Cast DB rows to a typed shape (node:sqlite returns loosely-typed rows). */
export const asRows = <T>(rows: unknown): T[] => rows as T[]
export const asRow = <T>(row: unknown): T => row as T

let db: BeaconDB | null = null

const MIGRATIONS: string[] = [
  // Migration 1: initial schema
  `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS monitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'GET',
    expected_status INTEGER NOT NULL DEFAULT 200,
    interval_sec INTEGER NOT NULL DEFAULT 60,
    timeout_ms INTEGER NOT NULL DEFAULT 10000,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    monitor_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    latency_ms INTEGER,
    status_code INTEGER,
    checked_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    monitor_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    message TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    resolved_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_checks_monitor ON checks (monitor_id, checked_at DESC);
  CREATE INDEX IF NOT EXISTS idx_events_monitor ON events (monitor_id, started_at DESC);
  `,
  // Migration 2: incident diagnostics (AI incident reporter)
  `
  ALTER TABLE events ADD COLUMN diagnosis TEXT;
  `,
]

export function getDB(): BeaconDB {
  if (db) return db
  const cfg = loadConfig()
  fs.mkdirSync(cfg.dataDir, { recursive: true })
  db = new DatabaseSync(cfg.dbPath)
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA foreign_keys = ON;')
  migrate(db)
  return db
}

function migrate(database: BeaconDB): void {
  const row = database.prepare('PRAGMA user_version').get() as { user_version: number } | undefined
  let version = row?.user_version ?? 0
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version]
    if (sql === undefined) break
    database.exec('BEGIN;')
    try {
      database.exec(sql)
      database.exec(`PRAGMA user_version = ${version + 1};`)
      database.exec('COMMIT;')
    } catch (err) {
      database.exec('ROLLBACK;')
      throw err
    }
    version += 1
  }
}