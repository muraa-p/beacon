import type { Status } from '../types'

const LABELS: Record<Status, string> = {
  up: 'Up',
  down: 'Down',
  unknown: 'Unknown',
  paused: 'Paused',
}

export default function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`badge badge-${status}`}>
      <span className="badge-dot" />
      {LABELS[status]}
    </span>
  )
}