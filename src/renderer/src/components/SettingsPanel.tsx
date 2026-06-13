import { useState } from 'react'
import { useStore, type PanelSide } from '../store'

type SettingsKey =
  | 'general'
  | 'integrations'
  | 'source'
  | 'tasks'
  | 'terminal'
  | 'commands'
  | 'browser'
  | 'floating'
  | 'appearance'
  | 'input'
  | 'notifications'
  | 'shortcuts'
  | 'usage'
  | 'remote'
  | 'ssh'
  | 'mobile'
  | 'privacy'

interface SettingsItem {
  id: SettingsKey
  label: string
  icon: string
  badge?: string
}

const GROUPS: { title: string; items: SettingsItem[] }[] = [
  {
    title: 'Set Up',
    items: [
      { id: 'general', label: 'General', icon: 'sliders' },
      { id: 'integrations', label: 'Integrations', icon: 'grid' }
    ]
  },
  {
    title: 'Workflows',
    items: [
      { id: 'source', label: 'Git & Source Control', icon: 'branch' },
      { id: 'tasks', label: 'Task Sources', icon: 'check' },
      { id: 'terminal', label: 'Terminal', icon: 'terminal' },
      { id: 'commands', label: 'Quick Commands', icon: 'play' },
      { id: 'browser', label: 'Browser', icon: 'globe' },
      { id: 'floating', label: 'Floating Workspace', icon: 'panel' }
    ]
  },
  {
    title: 'Interface',
    items: [
      { id: 'appearance', label: 'Appearance', icon: 'palette' },
      { id: 'input', label: 'Input & Editing', icon: 'edit' },
      { id: 'notifications', label: 'Notifications', icon: 'bell' },
      { id: 'shortcuts', label: 'Shortcuts', icon: 'keys' },
      { id: 'usage', label: 'Stats & Usage', icon: 'chart' }
    ]
  },
  {
    title: 'Remote Access',
    items: [
      { id: 'remote', label: 'Remote GenNal Servers', icon: 'server', badge: 'BETA' },
      { id: 'ssh', label: 'SSH Hosts', icon: 'plug' },
      { id: 'mobile', label: 'Mobile', icon: 'phone' }
    ]
  },
  {
    title: 'Privacy & Security',
    items: [{ id: 'privacy', label: 'Privacy & Telemetry', icon: 'lock' }]
  }
]

export default function SettingsPanel(): JSX.Element | null {
  const open = useStore((s) => s.settingsOpen)
  const toggleSettings = useStore((s) => s.toggleSettings)
  const panelSide = useStore((s) => s.panelSide)
  const setPanelSide = useStore((s) => s.setPanelSide)
  const rows = useStore((s) => s.rows)
  const cols = useStore((s) => s.cols)
  const setGrid = useStore((s) => s.setGrid)
  const [active, setActive] = useState<SettingsKey>('appearance')

  if (!open) return null

  const choosePanelSide = (side: PanelSide): void => setPanelSide(side)

  return (
    <div className="settings-overlay" onMouseDown={() => toggleSettings(false)}>
      <section className="settings-shell" onMouseDown={(event) => event.stopPropagation()}>
        <aside className="settings-nav">
          <div className="settings-nav-title">Settings</div>
          {GROUPS.map((group) => (
            <div className="settings-group" key={group.title}>
              <div className="settings-group-title">{group.title}</div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  className={`settings-nav-item ${active === item.id ? 'active' : ''}`}
                  onClick={() => setActive(item.id)}
                >
                  <span className={`settings-nav-icon icon-${item.icon}`} />
                  <span>{item.label}</span>
                  {item.badge && <span className="settings-badge">{item.badge}</span>}
                </button>
              ))}
            </div>
          ))}
        </aside>

        <main className="settings-main">
          <div className="settings-main-head">
            <div>
              <div className="settings-kicker">Interface</div>
              <h2>{active === 'appearance' ? 'Appearance' : GROUPS.flatMap((g) => g.items).find((i) => i.id === active)?.label}</h2>
            </div>
            <button className="settings-close" onClick={() => toggleSettings(false)}>Close</button>
          </div>

          {active === 'appearance' ? (
            <div className="settings-content">
              <div className="settings-card">
                <div>
                  <h3>Code panel position</h3>
                  <p>Choose whether the code editor opens on the left or right of the model workspace.</p>
                </div>
                <div className="settings-segment">
                  <button className={panelSide === 'left' ? 'active' : ''} onClick={() => choosePanelSide('left')}>Left</button>
                  <button className={panelSide === 'right' ? 'active' : ''} onClick={() => choosePanelSide('right')}>Right</button>
                </div>
              </div>

              <div className="settings-card">
                <div>
                  <h3>Default grid</h3>
                  <p>Quickly set the active model grid size.</p>
                </div>
                <div className="settings-grid-actions">
                  <button className={rows === 1 && cols === 1 ? 'active' : ''} onClick={() => setGrid(1, 1)}>1x1</button>
                  <button className={rows === 2 && cols === 2 ? 'active' : ''} onClick={() => setGrid(2, 2)}>2x2</button>
                  <button className={rows === 3 && cols === 2 ? 'active' : ''} onClick={() => setGrid(3, 2)}>3x2</button>
                </div>
              </div>

              <div className="settings-card preview-card">
                <div>
                  <h3>Theme</h3>
                  <p>Dark cockpit theme is active.</p>
                </div>
                <div className="theme-preview">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          ) : (
            <div className="settings-placeholder">
              <h3>{GROUPS.flatMap((g) => g.items).find((i) => i.id === active)?.label}</h3>
              <p>This section is ready for configuration controls.</p>
            </div>
          )}
        </main>
      </section>
    </div>
  )
}
