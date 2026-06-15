import { useStore } from '../store'

export default function StatusBar(): JSX.Element {
  const stats = useStore((s) => s.stats)
  const sessions = useStore((s) => s.sessions)
  const activeId = useStore((s) => s.activeId)
  const mode = useStore((s) => s.mode)
  const rows = useStore((s) => s.rows)
  const cols = useStore((s) => s.cols)
  const active = sessions.find((s) => s.id === activeId)

  return (
    <footer className="statusbar">
      <span className="sb-item">● Main</span>
      <span className="sb-item">Layout: {mode} ({rows}×{cols})</span>
      <span className="sb-item">UTF-8</span>
      <span className="sb-item">Shell: PowerShell</span>
      <span className="sb-spacer" />
      <span className="sb-item">{active ? `Model: ${active.label}` : 'No model'}</span>
      <span className="sb-item">CPU: {stats.cpu}%</span>
      <span className="sb-item">Mem: {(stats.memUsedMB / 1024).toFixed(1)} GB</span>
      <span className="sb-item">v1.0.4</span>
    </footer>
  )
}
