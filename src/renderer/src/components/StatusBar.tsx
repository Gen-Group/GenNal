import { useStore } from '../store'
import HelpMenu from './HelpMenu'
import { APP_VERSION } from '../version'

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
      <span className="sb-item">
        <span className={`sb-dot ${sessions.length > 0 ? 'on' : ''}`} aria-hidden="true" />
        {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
      </span>
      <span className="sb-item">Layout <b className="sb-val">{mode} {rows}×{cols}</b></span>
      <span className="sb-item">UTF-8</span>
      <span className="sb-item">Shell <b className="sb-val">{window.api.shellName}</b></span>
      <span className="sb-spacer" />
      <span className="sb-item">{active ? <>Model <b className="sb-val">{active.label}</b></> : 'No model'}</span>
      <span className="sb-item">CPU <b className="sb-val">{stats.cpu}%</b></span>
      <span className="sb-item">Mem <b className="sb-val">{(stats.memUsedMB / 1024).toFixed(1)} GB</b></span>
      <span className="sb-item sb-version">v{APP_VERSION}</span>
    </footer>
  )
}
