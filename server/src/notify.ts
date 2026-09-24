import nodemailer from 'nodemailer'
import type { BeaconDB } from './db.js'
import { getSettings } from './settings.js'
import type { Config } from './config.js'

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

export async function sendNotifications(
  db: BeaconDB,
  cfg: Config,
  kind: 'DOWN' | 'UP',
  monitorName: string,
  message: string,
): Promise<void> {
  const settings = getSettings(db)
  const subject = `[Beacon] ${monitorName} is ${kind === 'DOWN' ? 'DOWN' : 'UP'}`
  const body = `${kind === 'DOWN' ? '🔴' : '🟢'} ${subject}\n\n${message}\n\nView status: ${cfg.publicUrl}`
  const jobs: Promise<unknown>[] = []

  for (const webhook of settings.notifications.webhooks) {
    if (!webhook.url) continue
    jobs.push(
      (async () => {
        try {
          await fetch(webhook.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              kind,
              monitor: monitorName,
              message,
              time: new Date().toISOString(),
            }),
          })
        } catch (err) {
          console.warn(`[webhook:${webhook.name}] failed:`, (err as Error).message)
        }
      })(),
    )
  }

  const email = settings.notifications.email
  if (email.enabled && email.host && email.to) {
    jobs.push(
      (async () => {
        try {
          const transport = nodemailer.createTransport({
            host: email.host,
            port: email.port,
            secure: email.secure,
            auth: email.user ? { user: email.user, pass: email.pass } : undefined,
          })
          await transport.sendMail({
            from: email.from || email.user || 'beacon@localhost',
            to: email.to,
            subject,
            text: body,
          })
        } catch (err) {
          console.warn('[email] failed:', (err as Error).message)
        }
      })(),
    )
  }

  await Promise.allSettled(jobs)
}