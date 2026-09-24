import { useState, type FormEvent } from 'react'
import { api } from '../api'
import type { Settings } from '../types'

interface Props {
  settings: Settings
  onSave: (s: Settings) => void
  onNotice: (msg: string) => void
}

export default function SettingsPage({ settings, onSave, onNotice }: Props) {
  const [draft, setDraft] = useState<Settings>(structuredClone(settings))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updatePage = (patch: Partial<Settings['page']>) =>
    setDraft((d) => ({ ...d, page: { ...d.page, ...patch } }))

  const updateEmail = (patch: Partial<Settings['notifications']['email']>) =>
    setDraft((d) => ({
      ...d,
      notifications: { ...d.notifications, email: { ...d.notifications.email, ...patch } },
    }))

  const addWebhook = () =>
    setDraft((d) => ({
      ...d,
      notifications: {
        ...d.notifications,
        webhooks: [
          ...d.notifications.webhooks,
          { id: crypto.randomUUID(), name: `Webhook ${d.notifications.webhooks.length + 1}`, url: '' },
        ],
      },
    }))

  const removeWebhook = (id: string) =>
    setDraft((d) => ({
      ...d,
      notifications: {
        ...d.notifications,
        webhooks: d.notifications.webhooks.filter((w) => w.id !== id),
      },
    }))

  const updateWebhook = (id: string, patch: { name?: string; url?: string }) =>
    setDraft((d) => ({
      ...d,
      notifications: {
        ...d.notifications,
        webhooks: d.notifications.webhooks.map((w) => (w.id === id ? { ...w, ...patch } : w)),
      },
    }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const saved = await api.updateSettings(draft)
      onSave(saved)
      setDraft(structuredClone(saved))
      onNotice('Settings saved')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const email = draft.notifications.email

  return (
    <form onSubmit={submit}>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="sub">Status page appearance and notifications</p>
        </div>
        <button className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save settings'}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      <h3 className="section-title">Status page</h3>
      <div className="card stack">
        <label className="field">
          <span>Page title</span>
          <input
            value={draft.page.title}
            onChange={(e) => updatePage({ title: e.target.value })}
            maxLength={100}
          />
        </label>
        <label className="field">
          <span>Description</span>
          <input
            value={draft.page.description}
            onChange={(e) => updatePage({ description: e.target.value })}
            maxLength={300}
            placeholder="Optional line under the title"
          />
        </label>
        <label className="field">
          <span>Theme</span>
          <select
            value={draft.page.theme}
            onChange={(e) => updatePage({ theme: e.target.value as 'dark' | 'light' })}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
      </div>

      <h3 className="section-title">Webhooks</h3>
      <div className="card stack">
        <p className="muted small">
          A JSON payload is POSTed to each URL when a monitor goes down or recovers.
        </p>
        {draft.notifications.webhooks.map((w) => (
          <div key={w.id} className="webhook-row">
            <input
              value={w.name}
              onChange={(e) => updateWebhook(w.id, { name: e.target.value })}
              placeholder="Name"
            />
            <input
              value={w.url}
              onChange={(e) => updateWebhook(w.id, { url: e.target.value })}
              placeholder="https://hooks.example.com/…"
            />
            <button type="button" className="btn ghost danger" onClick={() => removeWebhook(w.id)}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="btn ghost" onClick={addWebhook}>
          + Add webhook
        </button>
      </div>

      <h3 className="section-title">Email</h3>
      <div className="card stack">
        <label className="check">
          <input
            type="checkbox"
            checked={email.enabled}
            onChange={(e) => updateEmail({ enabled: e.target.checked })}
          />
          Send email alerts on status changes
        </label>
        <div className="field-row">
          <label className="field">
            <span>SMTP host</span>
            <input value={email.host} onChange={(e) => updateEmail({ host: e.target.value })} />
          </label>
          <label className="field">
            <span>Port</span>
            <input
              type="number"
              value={email.port}
              onChange={(e) => updateEmail({ port: Number(e.target.value) })}
            />
          </label>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={email.secure}
            onChange={(e) => updateEmail({ secure: e.target.checked })}
          />
          Use TLS (port 465)
        </label>
        <div className="field-row">
          <label className="field">
            <span>Username</span>
            <input value={email.user} onChange={(e) => updateEmail({ user: e.target.value })} />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={email.pass}
              onChange={(e) => updateEmail({ pass: e.target.value })}
            />
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            <span>From</span>
            <input
              value={email.from}
              onChange={(e) => updateEmail({ from: e.target.value })}
              placeholder="beacon@example.com"
            />
          </label>
          <label className="field">
            <span>Notify</span>
            <input
              value={email.to}
              onChange={(e) => updateEmail({ to: e.target.value })}
              placeholder="you@example.com"
            />
          </label>
        </div>
      </div>
    </form>
  )
}