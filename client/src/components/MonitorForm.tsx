import { useState, type FormEvent } from 'react'
import type { Monitor, MonitorInput } from '../types'

interface Props {
  initial: Monitor | null
  onSubmit: (input: MonitorInput) => Promise<void>
  onCancel: () => void
}

export default function MonitorForm({ initial, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [url, setUrl] = useState(initial?.url ?? 'https://')
  const [method, setMethod] = useState<'GET' | 'HEAD' | 'POST'>(initial?.method ?? 'GET')
  const [expectedStatus, setExpectedStatus] = useState(initial?.expectedStatus ?? 200)
  const [intervalSec, setIntervalSec] = useState(initial?.intervalSec ?? 60)
  const [timeoutMs, setTimeoutMs] = useState(initial?.timeoutMs ?? 10_000)
  const [enabled, setEnabled] = useState(initial?.enabled ?? true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSubmit({
        name: name.trim(),
        url: url.trim(),
        method,
        expectedStatus,
        intervalSec,
        timeoutMs,
        enabled,
      })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
      return
    }
    setBusy(false)
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{initial ? 'Edit monitor' : 'Add monitor'}</h2>

        <label className="field">
          <span>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My API"
            required
            maxLength={100}
            autoFocus
          />
        </label>

        <label className="field">
          <span>URL</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/health"
            required
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span>Method</span>
            <select value={method} onChange={(e) => setMethod(e.target.value as 'GET' | 'HEAD' | 'POST')}>
              <option>GET</option>
              <option>HEAD</option>
              <option>POST</option>
            </select>
          </label>
          <label className="field">
            <span>Expected status</span>
            <input
              type="number"
              min={100}
              max={599}
              value={expectedStatus}
              onChange={(e) => setExpectedStatus(Number(e.target.value))}
            />
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span>Check every (seconds)</span>
            <input
              type="number"
              min={10}
              max={86_400}
              value={intervalSec}
              onChange={(e) => setIntervalSec(Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span>Timeout (ms)</span>
            <input
              type="number"
              min={500}
              max={120_000}
              step={500}
              value={timeoutMs}
              onChange={(e) => setTimeoutMs(Number(e.target.value))}
            />
          </label>
        </div>

        <label className="check">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enabled (checked automatically)
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : initial ? 'Save changes' : 'Create monitor'}
          </button>
        </div>
      </form>
    </div>
  )
}