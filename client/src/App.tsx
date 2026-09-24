import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from './api'
import type { Monitor, MonitorInput, Settings } from './types'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import MonitorDetail from './components/MonitorDetail'
import SettingsPage from './components/SettingsPage'
import MonitorForm from './components/MonitorForm'

type View = { kind: 'dashboard' } | { kind: 'detail'; id: number } | { kind: 'settings' }

export function toInput(m: Monitor): MonitorInput {
  return {
    name: m.name,
    url: m.url,
    method: m.method,
    expectedStatus: m.expectedStatus,
    intervalSec: m.intervalSec,
    timeoutMs: m.timeoutMs,
    enabled: m.enabled,
  }
}

export default function App() {
  const [user, setUser] = useState<string | null>(null)
  const [booting, setBooting] = useState(true)
  const [view, setView] = useState<View>({ kind: 'dashboard' })
  const [monitors, setMonitors] = useState<Monitor[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [editing, setEditing] = useState<Monitor | 'new' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const refreshMonitors = useCallback(async () => {
    try {
      setMonitors(await api.monitors())
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setUser(null)
    }
  }, [])

  useEffect(() => {
    api
      .me()
      .then((m) => setUser(m.username))
      .catch(() => setUser(null))
      .finally(() => setBooting(false))
  }, [])

  useEffect(() => {
    if (user) void refreshMonitors()
  }, [user, refreshMonitors])

  useEffect(() => {
    if (!settings && user) {
      api.settings().then(setSettings).catch(() => {})
    }
  }, [user, settings])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 3000)
    return () => clearTimeout(t)
  }, [notice])

  const logout = async () => {
    await api.logout().catch(() => {})
    setUser(null)
    setView({ kind: 'dashboard' })
  }

  const submitForm = async (input: MonitorInput) => {
    if (editing === 'new') {
      await api.createMonitor(input)
      setNotice(`Monitor "${input.name}" created`)
    } else if (editing) {
      await api.updateMonitor(editing.id, input)
      setNotice(`Monitor "${input.name}" updated`)
    }
    setEditing(null)
    await refreshMonitors()
  }

  if (booting) {
    return <div className="boot">Loading…</div>
  }

  if (!user) {
    return <Login onLogin={setUser} />
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">●</span> Beacon
        </div>
        <nav className="tabs">
          <button
            className={view.kind !== 'settings' ? 'tab active' : 'tab'}
            onClick={() => setView({ kind: 'dashboard' })}
          >
            Monitors
          </button>
          <button
            className={view.kind === 'settings' ? 'tab active' : 'tab'}
            onClick={() => setView({ kind: 'settings' })}
          >
            Settings
          </button>
        </nav>
        <div className="userbox">
          <span className="username">{user}</span>
          <button className="btn ghost" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <main className="content">
        {view.kind === 'dashboard' && (
          <Dashboard
            monitors={monitors}
            onRefresh={refreshMonitors}
            onOpen={(id) => setView({ kind: 'detail', id })}
            onEdit={(m) => setEditing(m)}
            onNew={() => setEditing('new')}
            onNotice={setNotice}
          />
        )}
        {view.kind === 'detail' && (
          <MonitorDetail
            key={view.id}
            id={view.id}
            onBack={() => {
              setView({ kind: 'dashboard' })
              void refreshMonitors()
            }}
            onNotice={setNotice}
          />
        )}
        {view.kind === 'settings' && settings && (
          <SettingsPage settings={settings} onSave={setSettings} onNotice={setNotice} />
        )}
        {view.kind === 'settings' && !settings && <div className="boot">Loading settings…</div>}
      </main>

      {editing && (
        <MonitorForm
          initial={editing === 'new' ? null : editing}
          onSubmit={submitForm}
          onCancel={() => setEditing(null)}
        />
      )}

      {notice && <div className="toast">{notice}</div>}
    </div>
  )
}