import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useStore, type PanelSide, type ThemeName } from '../store'

const THEME_OPTIONS: { id: ThemeName; label: string; hint: string }[] = [
  { id: 'dark', label: 'Dark', hint: 'Dark cockpit theme is active.' },
  { id: 'light', label: 'Light', hint: 'Light theme is active.' },
  { id: 'midnight', label: 'Midnight', hint: 'Deep midnight-blue theme is active.' },
  { id: 'ocean', label: 'Ocean', hint: 'Teal ocean theme is active.' },
  { id: 'forest', label: 'Forest', hint: 'Green forest theme is active.' },
  { id: 'sunset', label: 'Sunset', hint: 'Warm amber sunset theme is active.' },
  { id: 'rose', label: 'Rose', hint: 'Pink rose theme is active.' },
  { id: 'nord', label: 'Nord', hint: 'Cool nord frost theme is active.' }
]

const ICONS: Record<string, ReactNode> = {
  sliders: (
    <>
      <line x1="3" y1="6" x2="13" y2="6" />
      <line x1="18" y1="6" x2="21" y2="6" />
      <circle cx="15.5" cy="6" r="2" />
      <line x1="3" y1="12" x2="7" y2="12" />
      <line x1="12" y1="12" x2="21" y2="12" />
      <circle cx="9.5" cy="12" r="2" />
      <line x1="3" y1="18" x2="15" y2="18" />
      <line x1="20" y1="18" x2="21" y2="18" />
      <circle cx="17.5" cy="18" r="2" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  branch: (
    <>
      <line x1="6" y1="4" x2="6" y2="15" />
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <path d="M18 8.5c0 5-4 6.5-9 6.5" />
    </>
  ),
  check: (
    <>
      <path d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h10" />
      <path d="M8.5 11.5l3 3L22 4" />
    </>
  ),
  terminal: (
    <>
      <rect x="2" y="3" width="20" height="18" rx="3" />
      <polyline points="6 9 9 12 6 15" />
      <line x1="12" y1="15" x2="17" y2="15" />
    </>
  ),
  play: <polygon points="6 4 20 12 6 20 6 4" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <path d="M12 3a15 15 0 0 1 4 9 15 15 0 0 1-4 9 15 15 0 0 1-4-9 15 15 0 0 1 4-9z" />
    </>
  ),
  panel: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <line x1="14" y1="4" x2="14" y2="20" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.6-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.1 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-3.9-4-7.3-9-7.3z" />
      <circle cx="7.5" cy="11" r="1" />
      <circle cx="10" cy="7.5" r="1" />
      <circle cx="14.5" cy="7.5" r="1" />
    </>
  ),
  edit: (
    <>
      <path d="M11 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6" />
      <path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </>
  ),
  keys: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <line x1="6" y1="9.5" x2="6" y2="9.5" />
      <line x1="10" y1="9.5" x2="10" y2="9.5" />
      <line x1="14" y1="9.5" x2="14" y2="9.5" />
      <line x1="18" y1="9.5" x2="18" y2="9.5" />
      <line x1="8" y1="14.5" x2="16" y2="14.5" />
    </>
  ),
  chart: (
    <>
      <line x1="5" y1="21" x2="5" y2="11" />
      <line x1="10.5" y1="21" x2="10.5" y2="4" />
      <line x1="16" y1="21" x2="16" y2="14" />
      <line x1="3" y1="21" x2="21" y2="21" />
    </>
  ),
  server: (
    <>
      <rect x="3" y="3" width="18" height="7" rx="2" />
      <rect x="3" y="14" width="18" height="7" rx="2" />
      <line x1="7" y1="6.5" x2="7" y2="6.5" />
      <line x1="7" y1="17.5" x2="7" y2="17.5" />
    </>
  ),
  plug: (
    <>
      <path d="M9 2v6M15 2v6" />
      <path d="M6 8h12v2a6 6 0 0 1-12 0z" />
      <path d="M12 16v6" />
    </>
  ),
  phone: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="2.5" />
      <line x1="10.5" y1="18.5" x2="13.5" y2="18.5" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  )
}

function NavIcon({ name }: { name: string }): JSX.Element {
  return (
    <svg
      className="settings-nav-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name] ?? ICONS.grid}
    </svg>
  )
}

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

type TaskPriority = 'low' | 'normal' | 'high'
type TaskSourceId = 'workspace' | 'git' | 'runs' | 'terminal' | 'commands'

const PRIORITY_OPTIONS: { id: TaskPriority; label: string }[] = [
  { id: 'low', label: 'Low priority' },
  { id: 'normal', label: 'Normal priority' },
  { id: 'high', label: 'High priority' }
]

const TERMINAL_FONT_OPTIONS = [
  'JetBrains Mono, Consolas, monospace',
  'Consolas, monospace',
  'Cascadia Mono, Consolas, monospace'
]

const TERMINAL_SCROLLBACK_OPTIONS = [1000, 2000, 5000, 10000]

interface TaskSourceConfig {
  id: TaskSourceId
  enabled: boolean
}

interface TaskSourceSettings {
  sources: TaskSourceConfig[]
  autoDetectTodos: boolean
  includeContext: boolean
  syncOnOpen: boolean
  dedupeSimilar: boolean
  defaultPriority: TaskPriority
  maxTasks: number
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

const TASK_SOURCE_STORAGE = 'gennal.taskSources'

const TASK_SOURCE_META: {
  id: TaskSourceId
  title: string
  description: string
  detail: string
}[] = [
  {
    id: 'workspace',
    title: 'Workspace markers',
    description: 'Collect TODO, FIXME, HACK, and note markers from opened files.',
    detail: 'Code comments'
  },
  {
    id: 'git',
    title: 'Git changes',
    description: 'Turn changed files, branch metadata, and uncommitted work into follow-up tasks.',
    detail: 'Repository'
  },
  {
    id: 'runs',
    title: 'Run failures',
    description: 'Capture failed script output and test failures from the Output panel.',
    detail: 'Diagnostics'
  },
  {
    id: 'terminal',
    title: 'Terminal sessions',
    description: 'Watch active model terminals for errors, prompts, and blocked commands.',
    detail: 'Live sessions'
  },
  {
    id: 'commands',
    title: 'Quick commands',
    description: 'Promote saved quick commands and repeat workflows into reusable task templates.',
    detail: 'Templates'
  }
]

const DEFAULT_TASK_SETTINGS: TaskSourceSettings = {
  sources: TASK_SOURCE_META.map((source) => ({ id: source.id, enabled: source.id !== 'terminal' })),
  autoDetectTodos: true,
  includeContext: true,
  syncOnOpen: true,
  dedupeSimilar: true,
  defaultPriority: 'normal',
  maxTasks: 50
}

function loadTaskSourceSettings(): TaskSourceSettings {
  try {
    const raw = window.localStorage.getItem(TASK_SOURCE_STORAGE)
    if (!raw) return DEFAULT_TASK_SETTINGS
    const parsed = JSON.parse(raw) as Partial<TaskSourceSettings>
    const sourceMap = new Map(parsed.sources?.map((source) => [source.id, source.enabled]))
    return {
      ...DEFAULT_TASK_SETTINGS,
      ...parsed,
      sources: TASK_SOURCE_META.map((source) => ({
        id: source.id,
        enabled: sourceMap.get(source.id) ?? source.id !== 'terminal'
      })),
      defaultPriority:
        parsed.defaultPriority === 'low' || parsed.defaultPriority === 'high'
          ? parsed.defaultPriority
          : 'normal',
      maxTasks: [25, 50, 100].includes(parsed.maxTasks ?? 0) ? parsed.maxTasks ?? 50 : 50
    }
  } catch {
    return DEFAULT_TASK_SETTINGS
  }
}

function saveTaskSourceSettings(settings: TaskSourceSettings): void {
  try {
    window.localStorage.setItem(TASK_SOURCE_STORAGE, JSON.stringify(settings))
  } catch {
    /* ignore storage errors */
  }
}

interface RemoteServer {
  id: string
  name: string
  host: string
  token: string
  connected: boolean
}

const REMOTE_STORAGE = 'gennal.remoteServers'

function newId(): string {
  return 'srv_' + Math.random().toString(36).slice(2, 10)
}

function loadRemoteServers(): RemoteServer[] {
  try {
    const raw = window.localStorage.getItem(REMOTE_STORAGE)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Partial<RemoteServer>[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((s) => typeof s?.host === 'string' && s.host)
      .map((s) => ({
        id: typeof s.id === 'string' ? s.id : newId(),
        name: typeof s.name === 'string' && s.name ? s.name : 'Server',
        host: String(s.host),
        token: typeof s.token === 'string' ? s.token : '',
        connected: Boolean(s.connected)
      }))
  } catch {
    return []
  }
}

function saveRemoteServers(servers: RemoteServer[]): void {
  try {
    window.localStorage.setItem(REMOTE_STORAGE, JSON.stringify(servers))
  } catch {
    /* ignore storage errors */
  }
}

function normalizeHost(value: string): string {
  return value.trim().replace(/\s+/g, '')
}

export default function SettingsPanel(): JSX.Element | null {
  const open = useStore((s) => s.settingsOpen)
  const toggleSettings = useStore((s) => s.toggleSettings)
  const generalSettings = useStore((s) => s.generalSettings)
  const setGeneralSettings = useStore((s) => s.setGeneralSettings)
  const browserSettings = useStore((s) => s.browserSettings)
  const setBrowserSettings = useStore((s) => s.setBrowserSettings)
  const panelSide = useStore((s) => s.panelSide)
  const setPanelSide = useStore((s) => s.setPanelSide)
  const panelOpen = useStore((s) => s.panelOpen)
  const togglePanel = useStore((s) => s.togglePanel)
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const rows = useStore((s) => s.rows)
  const cols = useStore((s) => s.cols)
  const setGrid = useStore((s) => s.setGrid)
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const terminalSettings = useStore((s) => s.terminalSettings)
  const setTerminalSettings = useStore((s) => s.setTerminalSettings)
  const models = useStore((s) => s.models)
  const sessions = useStore((s) => s.sessions)
  const stats = useStore((s) => s.stats)
  const profile = useStore((s) => s.profile)
  const toggleProfileSetup = useStore((s) => s.toggleProfileSetup)
  const workspace = useStore((s) => s.workspace)
  const openWorkspace = useStore((s) => s.openWorkspace)
  const clearWorkspace = useStore((s) => s.clearWorkspace)
  const [active, setActive] = useState<SettingsKey>('appearance')
  const [taskSettings, setTaskSettings] = useState<TaskSourceSettings>(loadTaskSourceSettings)
  const [lastRefresh, setLastRefresh] = useState('Ready')
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(false)
  const priorityMenuRef = useRef<HTMLDivElement>(null)
  const [servers, setServers] = useState<RemoteServer[]>(loadRemoteServers)
  const [serverDraft, setServerDraft] = useState({ name: '', host: '', token: '' })
  const [serverError, setServerError] = useState('')

  useEffect(() => {
    if (!priorityMenuOpen) return

    const close = (event: MouseEvent): void => {
      if (priorityMenuRef.current?.contains(event.target as Node)) return
      setPriorityMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setPriorityMenuOpen(false)
    }

    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [priorityMenuOpen])

  if (!open) return null

  const choosePanelSide = (side: PanelSide): void => setPanelSide(side)
  const activeGroup = GROUPS.find((group) => group.items.some((item) => item.id === active))
  const activeItem = activeGroup?.items.find((item) => item.id === active)
  const activeTaskSourceCount = taskSettings.sources.filter((source) => source.enabled).length

  const updateTaskSettings = (updater: (settings: TaskSourceSettings) => TaskSourceSettings): void => {
    setTaskSettings((current) => {
      const next = updater(current)
      saveTaskSourceSettings(next)
      return next
    })
  }

  const toggleTaskSource = (id: TaskSourceId): void => {
    updateTaskSettings((settings) => ({
      ...settings,
      sources: settings.sources.map((source) =>
        source.id === id ? { ...source, enabled: !source.enabled } : source
      )
    }))
  }

  const setTaskOption = <Key extends keyof TaskSourceSettings>(
    key: Key,
    value: TaskSourceSettings[Key]
  ): void => {
    updateTaskSettings((settings) => ({ ...settings, [key]: value }))
  }

  const choosePriority = (priority: TaskPriority): void => {
    setTaskOption('defaultPriority', priority)
    setPriorityMenuOpen(false)
  }

  const persistServers = (next: RemoteServer[]): void => {
    saveRemoteServers(next)
    setServers(next)
  }

  const addServer = (): void => {
    const name = serverDraft.name.trim()
    const host = normalizeHost(serverDraft.host)
    if (!host) {
      setServerError('Enter a server host or URL.')
      return
    }
    if (servers.some((s) => s.host.toLowerCase() === host.toLowerCase())) {
      setServerError('That server is already added.')
      return
    }
    persistServers([
      ...servers,
      { id: newId(), name: name || host, host, token: serverDraft.token.trim(), connected: false }
    ])
    setServerDraft({ name: '', host: '', token: '' })
    setServerError('')
  }

  const removeServer = (id: string): void => {
    persistServers(servers.filter((s) => s.id !== id))
  }

  const toggleServerConnection = (id: string): void => {
    persistServers(servers.map((s) => (s.id === id ? { ...s, connected: !s.connected } : s)))
  }

  const openBrowserHome = (): void => {
    if (!browserSettings.openExternal) return
    const raw = browserSettings.homeUrl.trim()
    if (!raw) return
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const connectedServers = servers.filter((s) => s.connected).length

  const aiModels = models.filter((m) => m.id !== 'custom')
  const usageModels = (aiModels.length > 0 ? aiModels : models).map((model) => {
    const modelSessions = sessions.filter((s) => s.modelId === model.id)
    const running = modelSessions.filter((s) => s.status === 'running').length
    return {
      model,
      total: modelSessions.length,
      running,
      connected: running > 0
    }
  })
  const connectedModels = usageModels.filter((m) => m.connected).length
  const totalSessions = sessions.length
  const runningSessions = sessions.filter((s) => s.status === 'running').length

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
                  <NavIcon name={item.icon} />
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
              <div className="settings-kicker">{activeGroup?.title ?? 'Settings'}</div>
              <h2>{activeItem?.label ?? 'Settings'}</h2>
            </div>
            <button className="settings-close" onClick={() => toggleSettings(false)}>Close</button>
          </div>

          {active === 'general' ? (
            <div className="settings-content general-panel">
              <div className="settings-summary-grid">
                <div className="settings-summary">
                  <span>Workspace</span>
                  <strong>{workspace ? workspace.kind : 'None'}</strong>
                </div>
                <div className="settings-summary">
                  <span>Sessions</span>
                  <strong>{totalSessions}</strong>
                </div>
                <div className="settings-summary">
                  <span>Profile</span>
                  <strong>{profile.name ? 'Set' : 'Empty'}</strong>
                </div>
              </div>

              <div className="settings-card">
                <div>
                  <h3>Startup</h3>
                  <p>Choose whether GenNal reopens the last file or project when the app launches.</p>
                </div>
                <button
                  className={`task-toggle ${generalSettings.restoreWorkspaceOnLaunch ? 'on' : ''}`}
                  aria-pressed={generalSettings.restoreWorkspaceOnLaunch}
                  onClick={() =>
                    setGeneralSettings({
                      restoreWorkspaceOnLaunch: !generalSettings.restoreWorkspaceOnLaunch
                    })
                  }
                >
                  <span />
                </button>
              </div>

              <div className="settings-card general-workspace-card">
                <div>
                  <h3>Workspace</h3>
                  <p>
                    {workspace
                      ? `${workspace.name} · ${workspace.files.length} file${workspace.files.length === 1 ? '' : 's'}`
                      : 'Open a file or project folder to start working.'}
                  </p>
                </div>
                <div className="general-actions">
                  <button className="settings-close" onClick={() => void openWorkspace('file')}>Open file</button>
                  <button className="settings-close" onClick={() => void openWorkspace('project')}>Open project</button>
                  <button className="settings-close danger" disabled={!workspace} onClick={clearWorkspace}>Forget</button>
                </div>
              </div>

              <div className="settings-card">
                <div>
                  <h3>Workspace chrome</h3>
                  <p>Show or hide the navigation sidebar and code panel.</p>
                </div>
                <div className="settings-grid-actions">
                  <button className={sidebarOpen ? 'active' : ''} onClick={() => toggleSidebar()}>
                    Sidebar
                  </button>
                  <button className={panelOpen ? 'active' : ''} onClick={() => togglePanel()}>
                    Code panel
                  </button>
                </div>
              </div>

              <div className="settings-card">
                <div>
                  <h3>Profile</h3>
                  <p>{profile.name ? `${profile.name}${profile.role ? ` · ${profile.role}` : ''}` : 'Add your name and role for the sidebar profile.'}</p>
                </div>
                <button className="settings-close" onClick={() => toggleProfileSetup(true)}>
                  Edit profile
                </button>
              </div>
            </div>
          ) : active === 'appearance' ? (
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
                  <p>{THEME_OPTIONS.find((t) => t.id === theme)?.hint ?? 'Choose your appearance.'}</p>
                </div>
                <div className="theme-options">
                  {THEME_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      className={`theme-option ${theme === option.id ? 'active' : ''}`}
                      onClick={() => setTheme(option.id)}
                      aria-pressed={theme === option.id}
                    >
                      <span className={`theme-swatch theme-${option.id}`}>
                        <span className="ts-bar" />
                        <span className="ts-dot" />
                      </span>
                      <span className="theme-option-name">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : active === 'terminal' ? (
            <div className="settings-content terminal-panel">
              <div className="settings-summary-grid">
                <div className="settings-summary">
                  <span>Active terminals</span>
                  <strong>{runningSessions}</strong>
                </div>
                <div className="settings-summary">
                  <span>Total sessions</span>
                  <strong>{totalSessions}</strong>
                </div>
                <div className="settings-summary">
                  <span>Scrollback</span>
                  <strong>{terminalSettings.scrollback.toLocaleString()}</strong>
                </div>
              </div>

              <div className="settings-card terminal-preview-card">
                <div>
                  <h3>Terminal preview</h3>
                  <p>These preferences apply to new terminals and update open terminal panes.</p>
                </div>
                <div
                  className="terminal-preview"
                  style={{
                    fontFamily: terminalSettings.fontFamily,
                    fontSize: terminalSettings.fontSize
                  }}
                >
                  <span className="terminal-preview-prompt">$</span> codex --help
                  <br />
                  <span className="terminal-preview-muted">Ready for commands</span>
                  <span className={terminalSettings.cursorBlink ? 'terminal-preview-cursor blink' : 'terminal-preview-cursor'} />
                </div>
              </div>

              <div className="settings-card">
                <div>
                  <h3>Font size</h3>
                  <p>Set the terminal text size used by every model pane.</p>
                </div>
                <div className="settings-grid-actions">
                  {[11, 12.5, 14, 16].map((size) => (
                    <button
                      key={size}
                      className={terminalSettings.fontSize === size ? 'active' : ''}
                      onClick={() => setTerminalSettings({ fontSize: size })}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-card terminal-font-card">
                <div>
                  <h3>Font family</h3>
                  <p>Choose a monospace font stack for xterm panes.</p>
                </div>
                <div className="terminal-font-options">
                  {TERMINAL_FONT_OPTIONS.map((font) => (
                    <button
                      key={font}
                      className={terminalSettings.fontFamily === font ? 'active' : ''}
                      style={{ fontFamily: font }}
                      onClick={() => setTerminalSettings({ fontFamily: font })}
                    >
                      {font.split(',')[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-card task-options-card">
                <div>
                  <h3>Behavior</h3>
                  <p>Control cursor and session launch behavior.</p>
                </div>
                <div className="task-option-list">
                  <label className="task-check">
                    <input
                      type="checkbox"
                      checked={terminalSettings.cursorBlink}
                      onChange={(event) => setTerminalSettings({ cursorBlink: event.target.checked })}
                    />
                    <span>Blink terminal cursor</span>
                  </label>
                  <label className="task-check">
                    <input
                      type="checkbox"
                      checked={terminalSettings.focusNewSessions}
                      onChange={(event) => setTerminalSettings({ focusNewSessions: event.target.checked })}
                    />
                    <span>Focus newly launched sessions</span>
                  </label>
                </div>
              </div>

              <div className="settings-card task-limit-card">
                <div>
                  <h3>Scrollback buffer</h3>
                  <p>Choose how many terminal lines are kept in memory.</p>
                </div>
                <div className="settings-grid-actions">
                  {TERMINAL_SCROLLBACK_OPTIONS.map((limit) => (
                    <button
                      key={limit}
                      className={terminalSettings.scrollback === limit ? 'active' : ''}
                      onClick={() => setTerminalSettings({ scrollback: limit })}
                    >
                      {limit >= 1000 ? `${limit / 1000}k` : limit}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : active === 'browser' ? (
            <div className="settings-content browser-panel">
              <div className="settings-summary-grid">
                <div className="settings-summary">
                  <span>Launcher</span>
                  <strong>{browserSettings.openExternal ? 'On' : 'Off'}</strong>
                </div>
                <div className="settings-summary">
                  <span>History</span>
                  <strong>{browserSettings.saveHistory ? 'On' : 'Off'}</strong>
                </div>
                <div className="settings-summary">
                  <span>Context</span>
                  <strong>{browserSettings.attachWorkspaceContext ? 'On' : 'Off'}</strong>
                </div>
              </div>

              <div className="settings-card browser-home-card">
                <div>
                  <h3>Home page</h3>
                  <p>Set the default page used for browser-assisted research and quick lookups.</p>
                </div>
                <div className="browser-home-form">
                  <input
                    aria-label="Browser home page"
                    value={browserSettings.homeUrl}
                    placeholder="https://www.google.com"
                    onChange={(event) => setBrowserSettings({ homeUrl: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') openBrowserHome()
                    }}
                  />
                  <button
                    className="remote-add-btn"
                    disabled={!browserSettings.openExternal}
                    onClick={openBrowserHome}
                  >
                    Open
                  </button>
                </div>
              </div>

              <div className="settings-card">
                <div>
                  <h3>External browser launcher</h3>
                  <p>Open browser URLs in the system browser from GenNal.</p>
                </div>
                <button
                  className={`task-toggle ${browserSettings.openExternal ? 'on' : ''}`}
                  aria-pressed={browserSettings.openExternal}
                  onClick={() => setBrowserSettings({ openExternal: !browserSettings.openExternal })}
                >
                  <span />
                </button>
              </div>

              <div className="settings-card task-options-card">
                <div>
                  <h3>Browser behavior</h3>
                  <p>Control how browser sessions feed research and workspace context.</p>
                </div>
                <div className="task-option-list">
                  <label className="task-check">
                    <input
                      type="checkbox"
                      checked={browserSettings.saveHistory}
                      onChange={(event) => setBrowserSettings({ saveHistory: event.target.checked })}
                    />
                    <span>Remember recently opened browser URLs</span>
                  </label>
                  <label className="task-check">
                    <input
                      type="checkbox"
                      checked={browserSettings.attachWorkspaceContext}
                      onChange={(event) =>
                        setBrowserSettings({ attachWorkspaceContext: event.target.checked })
                      }
                    />
                    <span>Attach current workspace context to browser tasks</span>
                  </label>
                </div>
              </div>

              <div className="settings-card">
                <div>
                  <h3>Reset browser preferences</h3>
                  <p>Restore the default browser URL and behavior settings.</p>
                </div>
                <button
                  className="settings-close danger"
                  onClick={() =>
                    setBrowserSettings({
                      homeUrl: 'https://www.google.com',
                      openExternal: true,
                      saveHistory: true,
                      attachWorkspaceContext: true
                    })
                  }
                >
                  Reset
                </button>
              </div>
            </div>
          ) : active === 'tasks' ? (
            <div className="settings-content task-source-panel">
              <div className="settings-summary-grid">
                <div className="settings-summary">
                  <span>Active sources</span>
                  <strong>{activeTaskSourceCount}/{TASK_SOURCE_META.length}</strong>
                </div>
                <div className="settings-summary">
                  <span>Capture limit</span>
                  <strong>{taskSettings.maxTasks}</strong>
                </div>
                <div className="settings-summary">
                  <span>Status</span>
                  <strong>{lastRefresh}</strong>
                </div>
              </div>

              <div className="settings-card task-source-control">
                <div>
                  <h3>Task intake</h3>
                  <p>Choose how GenNal gathers work items from files, commands, runs, and sessions.</p>
                </div>
                <div className="task-source-actions">
                  <div className="grid-select priority-select" ref={priorityMenuRef}>
                    <button
                      className={`grid-select-btn priority-select-btn ${priorityMenuOpen ? 'open' : ''}`}
                      aria-haspopup="menu"
                      aria-expanded={priorityMenuOpen}
                      aria-label="Default task priority"
                      onClick={() => setPriorityMenuOpen((value) => !value)}
                    >
                      <span>{PRIORITY_OPTIONS.find((option) => option.id === taskSettings.defaultPriority)?.label}</span>
                      <span className="select-chevron" aria-hidden="true" />
                    </button>
                    {priorityMenuOpen && (
                      <div className="grid-menu priority-menu" role="menu">
                        {PRIORITY_OPTIONS.map((option) => (
                          <button
                            key={option.id}
                            className={taskSettings.defaultPriority === option.id ? 'active' : ''}
                            role="menuitemradio"
                            aria-checked={taskSettings.defaultPriority === option.id}
                            onClick={() => choosePriority(option.id)}
                          >
                            <span>{option.label}</span>
                            <span className="grid-menu-check" aria-hidden="true" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    className="settings-close"
                    onClick={() => setLastRefresh(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}
                  >
                    Scan now
                  </button>
                </div>
              </div>

              <div className="task-source-list" aria-label="Task source controls">
                {TASK_SOURCE_META.map((source) => {
                  const enabled = taskSettings.sources.find((item) => item.id === source.id)?.enabled ?? false
                  return (
                    <div className={`task-source-card ${enabled ? 'enabled' : ''}`} key={source.id}>
                      <div className="task-source-status" />
                      <div className="task-source-copy">
                        <div className="task-source-card-head">
                          <h3>{source.title}</h3>
                          <span>{source.detail}</span>
                        </div>
                        <p>{source.description}</p>
                      </div>
                      <button
                        className={`task-toggle ${enabled ? 'on' : ''}`}
                        aria-pressed={enabled}
                        onClick={() => toggleTaskSource(source.id)}
                      >
                        <span />
                      </button>
                    </div>
                  )
                })}
              </div>

              <div className="settings-card task-options-card">
                <div>
                  <h3>Detection rules</h3>
                  <p>Set the default behavior used when a workspace or run creates tasks.</p>
                </div>
                <div className="task-option-list">
                  <label className="task-check">
                    <input
                      type="checkbox"
                      checked={taskSettings.autoDetectTodos}
                      onChange={(event) => setTaskOption('autoDetectTodos', event.target.checked)}
                    />
                    <span>Detect TODO and FIXME comments</span>
                  </label>
                  <label className="task-check">
                    <input
                      type="checkbox"
                      checked={taskSettings.includeContext}
                      onChange={(event) => setTaskOption('includeContext', event.target.checked)}
                    />
                    <span>Attach file path, line, and run context</span>
                  </label>
                  <label className="task-check">
                    <input
                      type="checkbox"
                      checked={taskSettings.syncOnOpen}
                      onChange={(event) => setTaskOption('syncOnOpen', event.target.checked)}
                    />
                    <span>Sync sources when a workspace opens</span>
                  </label>
                  <label className="task-check">
                    <input
                      type="checkbox"
                      checked={taskSettings.dedupeSimilar}
                      onChange={(event) => setTaskOption('dedupeSimilar', event.target.checked)}
                    />
                    <span>Merge similar tasks from different sources</span>
                  </label>
                </div>
              </div>

              <div className="settings-card task-limit-card">
                <div>
                  <h3>Inbox size</h3>
                  <p>Limit how many source-generated tasks are kept in the active workspace inbox.</p>
                </div>
                <div className="settings-grid-actions">
                  {[25, 50, 100].map((limit) => (
                    <button
                      key={limit}
                      className={taskSettings.maxTasks === limit ? 'active' : ''}
                      onClick={() => setTaskOption('maxTasks', limit)}
                    >
                      {limit}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : active === 'remote' ? (
            <div className="settings-content remote-panel">
              <div className="settings-summary-grid">
                <div className="settings-summary">
                  <span>Servers</span>
                  <strong>{servers.length}</strong>
                </div>
                <div className="settings-summary">
                  <span>Connected</span>
                  <strong>{connectedServers}</strong>
                </div>
                <div className="settings-summary">
                  <span>Status</span>
                  <strong>{connectedServers > 0 ? 'Online' : 'Offline'}</strong>
                </div>
              </div>

              <div className="settings-card remote-add-card">
                <div>
                  <h3>Add a remote server</h3>
                  <p>Run model sessions on another machine. Enter its GenNal host and an optional access token.</p>
                </div>
                <div className="remote-form">
                  <div className="remote-form-row">
                    <input
                      aria-label="Server name"
                      placeholder="Name (e.g. Workstation)"
                      value={serverDraft.name}
                      maxLength={40}
                      onChange={(event) => setServerDraft((d) => ({ ...d, name: event.target.value }))}
                    />
                    <input
                      aria-label="Server host or URL"
                      placeholder="host:port or https://…"
                      value={serverDraft.host}
                      onChange={(event) => setServerDraft((d) => ({ ...d, host: event.target.value }))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') addServer()
                      }}
                    />
                  </div>
                  <div className="remote-form-row">
                    <input
                      aria-label="Access token"
                      type="password"
                      placeholder="Access token (optional)"
                      value={serverDraft.token}
                      onChange={(event) => setServerDraft((d) => ({ ...d, token: event.target.value }))}
                    />
                    <button className="remote-add-btn" onClick={addServer}>Add server</button>
                  </div>
                  {serverError && <p className="remote-error">{serverError}</p>}
                </div>
              </div>

              {servers.length === 0 ? (
                <div className="settings-placeholder remote-empty">
                  <h3>No remote servers yet</h3>
                  <p>Add a server above to connect GenNal to a remote machine.</p>
                </div>
              ) : (
                <div className="remote-list" aria-label="Remote servers">
                  {servers.map((server) => (
                    <div className={`remote-card ${server.connected ? 'connected' : ''}`} key={server.id}>
                      <span className="remote-status" />
                      <div className="remote-copy">
                        <div className="remote-card-head">
                          <h3>{server.name}</h3>
                          <span>{server.connected ? 'Connected' : 'Disconnected'}</span>
                        </div>
                        <p>{server.host}{server.token ? ' · token set' : ''}</p>
                      </div>
                      <div className="remote-card-actions">
                        <button
                          className={`remote-connect ${server.connected ? 'on' : ''}`}
                          onClick={() => toggleServerConnection(server.id)}
                        >
                          {server.connected ? 'Disconnect' : 'Connect'}
                        </button>
                        <button
                          className="remote-remove"
                          title="Remove server"
                          aria-label={`Remove ${server.name}`}
                          onClick={() => removeServer(server.id)}
                        >
                          <svg viewBox="0 0 14 14" width="13" height="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
                            <path d="M3.5 3.5 L10.5 10.5 M10.5 3.5 L3.5 10.5" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="remote-note">
                Remote servers are in beta. Connection state is saved locally on this device.
              </p>
            </div>
          ) : active === 'usage' ? (
            <div className="settings-content usage-panel">
              <div className="settings-summary-grid">
                <div className="settings-summary">
                  <span>AI connected</span>
                  <strong>{connectedModels}/{usageModels.length}</strong>
                </div>
                <div className="settings-summary">
                  <span>Active sessions</span>
                  <strong>{runningSessions}</strong>
                </div>
                <div className="settings-summary">
                  <span>Total sessions</span>
                  <strong>{totalSessions}</strong>
                </div>
                <div className="settings-summary">
                  <span>Memory</span>
                  <strong>{(stats.memUsedMB / 1024).toFixed(1)} GB</strong>
                </div>
              </div>

              <div className="settings-card usage-head-card">
                <div>
                  <h3>AI usage</h3>
                  <p>Every model GenNal can launch, and whether you currently have it connected.</p>
                </div>
                <span className={`usage-status-pill ${connectedModels > 0 ? 'on' : ''}`}>
                  {connectedModels > 0 ? `${connectedModels} online` : 'None connected'}
                </span>
              </div>

              <div className="usage-list" aria-label="AI usage">
                {usageModels.map(({ model, total, running, connected }) => (
                  <div className={`usage-card ${connected ? 'connected' : ''}`} key={model.id}>
                    <span className="usage-avatar" style={{ background: model.accent }}>
                      {model.label.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="usage-copy">
                      <div className="usage-card-head">
                        <h3>{model.label}</h3>
                        <span className="usage-tag">{model.tag}</span>
                      </div>
                      <p>{connected ? `${running} active session${running === 1 ? '' : 's'}` : 'Not connected'}{total > 0 ? ` · ${total} total` : ''}</p>
                    </div>
                    <span className={`usage-badge ${connected ? 'on' : ''}`}>
                      <span className="usage-dot" />
                      {connected ? 'Connected' : 'Idle'}
                    </span>
                  </div>
                ))}
                {usageModels.length === 0 && (
                  <div className="settings-placeholder remote-empty">
                    <h3>No models available</h3>
                    <p>Model definitions could not be loaded.</p>
                  </div>
                )}
              </div>

              <p className="remote-note">Usage reflects live sessions on this device.</p>
            </div>
          ) : (
            <div className="settings-placeholder">
              <h3>{activeItem?.label}</h3>
              <p>This section is ready for configuration controls.</p>
            </div>
          )}
        </main>
      </section>
    </div>
  )
}
