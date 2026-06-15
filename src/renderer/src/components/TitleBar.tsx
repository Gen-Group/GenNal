import { useStore } from '../store'
import logoUrl from '../assets/gennal-logo.png'

export default function TitleBar(): JSX.Element {
  const togglePalette = useStore((s) => s.togglePalette)
  const toggleSettings = useStore((s) => s.toggleSettings)
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const panelOpen = useStore((s) => s.panelOpen)
  const togglePanel = useStore((s) => s.togglePanel)
  const isMac = window.api.isMac

  return (
    <header className={`titlebar${isMac ? ' is-mac' : ''}`}>
      <div className="tb-left drag">
        <img className="brand-mark" src={logoUrl} alt="GenNal logo" />
        <span className="brand-name">GenNal</span>
        <span className="brand-pill">Pro</span>
      </div>

      <div className="tb-center">
        <button className="quick-cmd" onClick={() => togglePalette(true)}>
          <span>Quick command</span>
          <kbd>Ctrl K</kbd>
        </button>
      </div>

      <div className="tb-right">
        <button
          className={`icon-btn sidebar-toggle ${sidebarOpen ? 'active' : ''}`}
          title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          aria-pressed={sidebarOpen}
          onClick={() => toggleSidebar()}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
            <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
            <line x1="6" y1="2.5" x2="6" y2="13.5" />
          </svg>
        </button>
        <button
          className={`icon-btn panel-toggle ${panelOpen ? 'active' : ''}`}
          title={panelOpen ? 'Hide code panel' : 'Show code panel'}
          aria-label={panelOpen ? 'Hide code panel' : 'Show code panel'}
          aria-pressed={panelOpen}
          onClick={() => togglePanel()}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
            <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
            <line x1="10" y1="2.5" x2="10" y2="13.5" />
          </svg>
        </button>
        <button className="icon-btn settings-btn" title="Settings" aria-label="Settings" onClick={() => toggleSettings(true)}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        {!isMac && (
        <div className="win-ctrls">
          <button className="win-btn" title="Minimize" aria-label="Minimize" onClick={() => window.api.win.minimize()}>
            <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
              <rect x="2" y="5.4" width="8" height="1.2" fill="currentColor" />
            </svg>
          </button>
          <button className="win-btn" title="Maximize" aria-label="Maximize" onClick={() => window.api.win.maximize()}>
            <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
              <rect x="2.4" y="2.4" width="7.2" height="7.2" rx="1" />
            </svg>
          </button>
          <button className="win-btn close" title="Close" aria-label="Close" onClick={() => window.api.win.close()}>
            <svg viewBox="0 0 12 12" width="11" height="11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
              <path d="M3 3 L9 9 M9 3 L3 9" />
            </svg>
          </button>
        </div>
        )}
      </div>
    </header>
  )
}
