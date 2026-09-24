import { api } from '../api'
import type { Monitor } from '../types'
import { fmtRelative, fmtUptime } from '../utils'
import StatusBadge from './StatusBadge'
import { toInput } from '../App'

interface Props {
  monitors: Monitor[]
  onRefresh: () => Promise<void>
  onOpen: (id: number) => void
  onEdit: (m: Monitor) => void
  onNew: () => void
  onNotice: (msg: string) => void
}

export default function Dashboard({ monitors, onRefresh, onOpen, onEdit, onNew, onNotice }: Props) {
  const total = monitors.length
  const down = monitors.filter((m) => m.status === 'down').length

  const togglePause = async (m: Monitor) => {
    await api.updateMonitor(m.id, { ...toInput(m), enabled: !m.enabled })
    onNotice(m.enabled ? `"${m.name}" paused` : `"${m.name}" resumed`)
    await onRefresh()
  }

  const remove = async (m: Monitor) => {
    if (!confirm(`Delete monitor "${m.name}"? Its check history will be removed too.`)) return
    await api.deleteMonitor(m.id)
    onNotice(`Monitor "${m.name}" deleted`)
    await onRefresh()
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Monitors</h1>
          <p className="sub">
            {total === 0
              ? 'No monitors yet — add your first one.'
              : down === 0
                ? `All ${total} monitor${total === 1 ? '' : 's'} operational`
                : `${down} of ${total} monitor${total === 1 ? '' : 's'} down`}
          </p>
        </div>
        <button className="btn primary" onClick={onNew}>
          + Add monitor
        </button>
      </div>

      {total > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Name</th>
                <th className="num">Uptime 24h</th>
                <th className="num">7d</th>
                <th className="num">30d</th>
                <th className="num">Latency</th>
                <th>Last check</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {monitors.map((m) => (
                <tr key={m.id} className="row-click" onClick={() => onOpen(m.id)}>
                  <td>
                    <StatusBadge status={m.status} />
                  </td>
                  <td>
                    <div className="m-name">{m.name}</div>
                    <div className="m-url">{m.url}</div>
                  </td>
                  <td className="num">{fmtUptime(m.uptime['24h'])}</td>
                  <td className="num">{fmtUptime(m.uptime['7d'])}</td>
                  <td className="num">{fmtUptime(m.uptime['30d'])}</td>
                  <td className="num">{m.lastLatencyMs !== null ? `${m.lastLatencyMs} ms` : '—'}</td>
                  <td className="muted">
                    {m.lastCheckedAt ? fmtRelative(m.lastCheckedAt) : 'never'}
                  </td>
                  <td className="actions" onClick={(e) => e.stopPropagation()}>
                    <button className="btn ghost" onClick={() => onEdit(m)}>
                      Edit
                    </button>
                    <button className="btn ghost" onClick={() => void togglePause(m)}>
                      {m.enabled ? 'Pause' : 'Resume'}
                    </button>
                    <button className="btn ghost danger" onClick={() => void remove(m)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="hint">
        Public status page:{' '}
        <a href="/" target="_blank" rel="noreferrer">
          {window.location.origin}/
        </a>
      </p>
    </div>
  )
}