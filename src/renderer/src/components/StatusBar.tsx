import { useStore } from '../store'
import HelpMenu from './HelpMenu'

export default function StatusBar(): JSX.Element {
  const stats = useStore((s) => s.stats)
  const sessions = useStore((s) => s.sessions)
  const activeId = useStore((s) => s.activeId)
  const mode = useStore((s) => s.mode)
  const rows = useStore((s) => s.rows)
  const cols = useStore((s) => s.cols)
  const toggleSettings = useStore((s) => s.toggleSettings)
  const active = sessions.find((s) => s.id === activeId)

  return (
    <footer className="statusbar">
      <span className="sb-left">
        <button className="sb-btn" title="Settings" aria-label="Settings" onClick={() => toggleSettings(true)}>
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="8" cy="8" r="2.1" />
            <path d="M8 1.6v1.8M8 12.6v1.8M14.4 8h-1.8M3.4 8H1.6M12.5 3.5l-1.3 1.3M4.8 11.2l-1.3 1.3M12.5 12.5l-1.3-1.3M4.8 4.8 3.5 3.5" />
          </svg>
        </button>
        <HelpMenu />
      </span>
      <span className="sb-item">● Main</span>
      <span className="sb-item">Layout: {mode} ({rows}×{cols})</span>
      <span className="sb-item">UTF-8</span>
      <span className="sb-item">Shell: {window.api.shellName}</span>
      <span className="sb-spacer" />
      <span className="sb-item">{active ? `Model: ${active.label}` : 'No model'}</span>
      <span className="sb-item">CPU: {stats.cpu}%</span>
      <span className="sb-item">Mem: {(stats.memUsedMB / 1024).toFixed(1)} GB</span>
      <span className="sb-item">v1.0.6</span>
    </footer>
  )
}
