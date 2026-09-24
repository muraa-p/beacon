import { loadConfig } from './config.js'
import { getDB } from './db.js'
import { ensureAdmin } from './auth.js'
import { startChecker } from './checker.js'
import { createApp } from './app.js'

const cfg = loadConfig()
ensureAdmin(getDB(), cfg)

const app = createApp()
startChecker()

app.listen(cfg.port, () => {
  console.log(`Beacon running at http://localhost:${cfg.port}`)
  console.log(`  Public status page: http://localhost:${cfg.port}/`)
  console.log(`  Admin dashboard:    http://localhost:${cfg.port}/dashboard`)
})