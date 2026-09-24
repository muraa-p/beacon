import express, { type Request, type Response } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDB } from './db.js'
import { apiRouter } from './api.js'
import { statusPageRouter } from './statuspage.js'

const here = path.dirname(fileURLToPath(import.meta.url))

export function createApp() {
  const db = getDB()
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '1mb' }))

  app.use('/api', apiRouter(db))
  app.use(statusPageRouter(db))

  // Serve the built dashboard, if it exists.
  const clientDist = path.resolve(here, '../../client/dist')
  if (fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use('/dashboard', express.static(clientDist, { index: false }))
    const sendIndex = (_req: Request, res: Response): void => {
      res.sendFile(path.join(clientDist, 'index.html'))
    }
    app.get('/dashboard', sendIndex)
    app.get('/dashboard/*', sendIndex)
  } else {
    app.get('/dashboard', (_req, res) => {
      res
        .status(503)
        .type('text')
        .send('Dashboard not built yet.\n\nRun:  npm run build\n\n(Or use "npm run dev" for development.)')
    })
  }

  app.use((_req, res) => {
    res.status(404).type('text').send('Not found')
  })

  return app
}