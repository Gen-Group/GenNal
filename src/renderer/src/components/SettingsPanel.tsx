import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useStore, type NotificationSound, type PanelSide, type ThemeName } from '../store'
import { playNotificationSound } from '../notification-sound'
import type { MobileStatus } from '../../../shared/types'
import UsageDetail from './UsageDetail'
import ProjectSettingsPanel from './ProjectSettingsPanel'
import ProvidersUsage from './ProvidersUsage'
import Modal from './Modal'
import { accentForPath as projectAccent } from '../accents'

const THEME_OPTIONS: { id: ThemeName; label: string; hint: string }[] = [
  { id: 'dark', label: 'Dark', hint: 'Dark cockpit theme is active.' },
  { id: 'light', label: 'Light', hint: 'Light theme is active.' },
  { id: 'midnight', label: 'Midnight', hint: 'Deep midnight-blue theme is active.' },
  { id: 'ocean', label: 'Ocean', hint: 'Teal ocean theme is active.' },
  { id: 'forest', label: 'Forest', hint: 'Green forest theme is active.' },
  { id: 'sunset', label: 'Sunset', hint: 'Warm amber sunset theme is active.' },
  { id: 'rose', label: 'Rose', hint: 'Pink rose theme is active.' },
  { id: 'nord', label: 'Nord', hint: 'Cool nord frost theme is active.' },
  { id: 'slate', label: 'Slate', hint: 'Neutral slate-gray theme is active.' },
  { id: 'graphite', label: 'Graphite', hint: 'Monochrome graphite theme is active.' },
  { id: 'stone', label: 'Stone', hint: 'Warm neutral stone theme is active.' }
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
  | 'project'

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

const NOTIFICATION_SOUND_OPTIONS: { id: NotificationSound; label: string }[] = [
  { id: 'system', label: 'System Default' },
  { id: 'chime', label: 'Chime' },
  { id: 'ping', label: 'Ping' },
  { id: 'none', label: 'None (silent)' }
]

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

type PrivacyToggleKey =
  | 'telemetry'
  | 'crashReports'
  | 'rememberHistory'
  | 'rememberWorkspace'
  | 'redactSecrets'
  | 'clearOnExit'

const PRIVACY_TOGGLES: { key: PrivacyToggleKey; title: string; description: string }[] = [
  {
    key: 'telemetry',
    title: 'Anonymous usage analytics',
    description: 'Share anonymous, aggregated feature usage to help improve GenNal. Off by default.'
  },
  {
    key: 'crashReports',
    title: 'Crash reports',
    description: 'Send diagnostic crash reports when GenNal stops unexpectedly. No file contents are included.'
  },
  {
    key: 'redactSecrets',
    title: 'Redact secrets in logs',
    description: 'Mask API keys, tokens, and passwords detected in terminal output and run logs.'
  },
  {
    key: 'rememberHistory',
    title: 'Remember command history',
    description: 'Keep recent quick commands and run history on this device between launches.'
  },
  {
    key: 'rememberWorkspace',
    title: 'Remember opened workspace',
    description: 'Store the last opened file or project so it can be restored on the next launch.'
  },
  {
    key: 'clearOnExit',
    title: 'Clear local data on exit',
    description: 'Wipe stored history, workspace references, and saved servers every time GenNal closes.'
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

function isValidRemoteHost(value: string): boolean {
  if (!value) return false
  if (/^https?:\/\/[^/\s:]+(?::\d{1,5})?(?:\/.*)?$/i.test(value)) return true
  return /^[a-z0-9.-]+:\d{1,5}$/i.test(value)
}

function formatHistoryDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown time'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

// ---- Keyboard shortcuts ----
interface ShortcutBinding {
  id: string
  label: string
  group: string
  keys: string
  defaultKeys: string
}

type ShortcutStatus = 'all' | 'modified' | 'unassigned' | 'conflicts'
type TerminalPrecedence = 'app' | 'terminal'

const SHORTCUTS_STORAGE = 'gennal.shortcutBindings'
const TERMINAL_PRECEDENCE_STORAGE = 'gennal.shortcutTerminalPrecedence'

const DEFAULT_SHORTCUTS: ShortcutBinding[] = [
  { id: 'palette', label: 'Command Palette', group: 'Global', defaultKeys: 'Ctrl+K', keys: 'Ctrl+K' },
  { id: 'new-window', label: 'New Window', group: 'Global', defaultKeys: 'Ctrl+N', keys: 'Ctrl+N' },
  { id: 'search', label: 'Search', group: 'Global', defaultKeys: 'Ctrl+P', keys: 'Ctrl+P' },
  { id: 'open-settings', label: 'Open Settings', group: 'Global', defaultKeys: 'Ctrl+,', keys: 'Ctrl+,' },
  { id: 'force-reload', label: 'Force Reload', group: 'Global', defaultKeys: 'Ctrl+Shift+R', keys: 'Ctrl+Shift+R' },
  { id: 'toggle-sidebar', label: 'Toggle Sidebar', group: 'View', defaultKeys: 'Ctrl+B', keys: 'Ctrl+B' },
  { id: 'toggle-panel', label: 'Toggle Side Panel', group: 'View', defaultKeys: 'Ctrl+J', keys: 'Ctrl+J' },
  { id: 'zoom-in', label: 'Zoom In', group: 'View', defaultKeys: 'Ctrl++', keys: 'Ctrl++' },
  { id: 'zoom-out', label: 'Zoom Out', group: 'View', defaultKeys: 'Ctrl+-', keys: 'Ctrl+-' },
  { id: 'zoom-reset', label: 'Reset Zoom', group: 'View', defaultKeys: 'Ctrl+0', keys: 'Ctrl+0' },
  { id: 'open-tasks', label: 'Open Tasks', group: 'View', defaultKeys: '', keys: '' },
  { id: 'open-automations', label: 'Open Automations', group: 'View', defaultKeys: '', keys: '' },
  { id: 'open-history', label: 'Open History', group: 'View', defaultKeys: '', keys: '' },
  { id: 'new-session', label: 'New Session', group: 'Terminal', defaultKeys: 'Ctrl+Shift+T', keys: 'Ctrl+Shift+T' },
  { id: 'close-session', label: 'Close Session', group: 'Terminal', defaultKeys: 'Ctrl+Shift+W', keys: 'Ctrl+Shift+W' },
  { id: 'next-session', label: 'Next Session', group: 'Terminal', defaultKeys: 'Ctrl+Shift+]', keys: 'Ctrl+Shift+]' },
  { id: 'prev-session', label: 'Previous Session', group: 'Terminal', defaultKeys: 'Ctrl+Shift+[', keys: 'Ctrl+Shift+[' },
  { id: 'clear-terminal', label: 'Clear Terminal', group: 'Terminal', defaultKeys: '', keys: '' },
  { id: 'rename-session', label: 'Rename Session', group: 'Terminal', defaultKeys: '', keys: '' }
]

function loadShortcuts(): ShortcutBinding[] {
  try {
    const raw = window.localStorage.getItem(SHORTCUTS_STORAGE)
    if (!raw) return DEFAULT_SHORTCUTS.map((s) => ({ ...s }))
    const parsed = JSON.parse(raw) as Partial<ShortcutBinding>[]
    const saved = new Map(
      (Array.isArray(parsed) ? parsed : [])
        .filter((s) => typeof s?.id === 'string' && typeof s.keys === 'string')
        .map((s) => [s.id as string, s.keys as string])
    )
    // Defaults are the source of truth for which commands exist; saved overrides keys only.
    return DEFAULT_SHORTCUTS.map((s) => ({ ...s, keys: saved.get(s.id) ?? s.keys }))
  } catch {
    return DEFAULT_SHORTCUTS.map((s) => ({ ...s }))
  }
}

function saveShortcuts(bindings: ShortcutBinding[]): void {
  try {
    const payload = bindings.map((s) => ({ id: s.id, keys: s.keys }))
    window.localStorage.setItem(SHORTCUTS_STORAGE, JSON.stringify(payload))
  } catch {
    /* ignore storage errors */
  }
}

function loadTerminalPrecedence(): TerminalPrecedence {
  return window.localStorage.getItem(TERMINAL_PRECEDENCE_STORAGE) === 'terminal' ? 'terminal' : 'app'
}

const MODIFIER_KEYS = new Set(['Control', 'Meta', 'Alt', 'Shift'])

/** Convert a keydown into a normalized combo like "Ctrl+Shift+P", or null for a lone modifier. */
function eventToCombo(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.metaKey) parts.push('Cmd')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  let main = e.key
  if (main === ' ') main = 'Space'
  else if (main.length === 1) main = main.toUpperCase()
  parts.push(main)
  return parts.join('+')
}

const KEY_GLYPHS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Cmd: '⌘'
}

function comboParts(keys: string): string[] {
  if (!keys) return []
  return keys.split('+').map((part) => KEY_GLYPHS[part] ?? part)
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
  const prompt = useStore((s) => s.prompt)
  const removeSession = useStore((s) => s.removeSession)
  const privacySettings = useStore((s) => s.privacySettings)
  const setPrivacySettings = useStore((s) => s.setPrivacySettings)
  const chatHistory = useStore((s) => s.chatHistory)
  const clearChatHistory = useStore((s) => s.clearChatHistory)
  const editorSettings = useStore((s) => s.editorSettings)
  const setEditorSettings = useStore((s) => s.setEditorSettings)
  const notificationSettings = useStore((s) => s.notificationSettings)
  const setNotificationSettings = useStore((s) => s.setNotificationSettings)
  const clearLocalData = useStore((s) => s.clearLocalData)
  const models = useStore((s) => s.models)
  const sessions = useStore((s) => s.sessions)
  const addSession = useStore((s) => s.addSession)
  const removeModel = useStore((s) => s.removeModel)
  const toggleAddModel = useStore((s) => s.toggleAddModel)
  const pendingUsageModelId = useStore((s) => s.pendingUsageModelId)
  const clearPendingUsage = useStore((s) => s.clearPendingUsage)
  const stats = useStore((s) => s.stats)
  const profile = useStore((s) => s.profile)
  const toggleProfileSetup = useStore((s) => s.toggleProfileSetup)
  const workspace = useStore((s) => s.workspace)
  const openWorkspace = useStore((s) => s.openWorkspace)
  const browseProject = useStore((s) => s.browseProject)
  const recentProjects = useStore((s) => s.recentProjects)
  const projectSettings = useStore((s) => s.projectSettings)
  const clearWorkspace = useStore((s) => s.clearWorkspace)
  const toggleMobile = useStore((s) => s.toggleMobile)
  const [active, setActive] = useState<SettingsKey>('appearance')
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [mobileStatus, setMobileStatus] = useState<MobileStatus | null>(null)
  const [mobileCopied, setMobileCopied] = useState(false)
  const [taskSettings, setTaskSettings] = useState<TaskSourceSettings>(loadTaskSourceSettings)
  const [lastRefresh, setLastRefresh] = useState('Ready')
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(false)
  const priorityMenuRef = useRef<HTMLDivElement>(null)
  const [servers, setServers] = useState<RemoteServer[]>(loadRemoteServers)
  const [serverDraft, setServerDraft] = useState({ name: '', host: '', token: '' })
  const [serverError, setServerError] = useState('')
  const [usageDetailId, setUsageDetailId] = useState<string | null>(null)
  const [dataCleared, setDataCleared] = useState(false)
  const [notificationTest, setNotificationTest] = useState('')
  const [shortcuts, setShortcuts] = useState<ShortcutBinding[]>(loadShortcuts)
  const [shortcutQuery, setShortcutQuery] = useState('')
  const [shortcutStatus, setShortcutStatus] = useState<ShortcutStatus>('all')
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [terminalPrecedence, setTerminalPrecedence] = useState<TerminalPrecedence>(loadTerminalPrecedence)

  const updateShortcut = (id: string, keys: string): void => {
    setShortcuts((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, keys } : s))
      saveShortcuts(next)
      return next
    })
  }

  const resetShortcuts = (): void => {
    const next = DEFAULT_SHORTCUTS.map((s) => ({ ...s }))
    setShortcuts(next)
    saveShortcuts(next)
    setRecordingId(null)
  }

  const chooseTerminalPrecedence = (value: TerminalPrecedence): void => {
    setTerminalPrecedence(value)
    window.localStorage.setItem(TERMINAL_PRECEDENCE_STORAGE, value)
  }

  // While recording, the next key combo is captured for the active row.
  useEffect(() => {
    if (!recordingId) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setRecordingId(null)
        return
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        updateShortcut(recordingId, '')
        setRecordingId(null)
        return
      }
      const combo = eventToCombo(e)
      if (!combo) return
      updateShortcut(recordingId, combo)
      setRecordingId(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recordingId])

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

  // Honor a "View usage" deep-link: jump to the Stats & Usage detail for the model.
  useEffect(() => {
    if (!pendingUsageModelId) return
    setActive('usage')
    setUsageDetailId(pendingUsageModelId)
    clearPendingUsage()
  }, [pendingUsageModelId, clearPendingUsage])

  // Reflect the live bridge state while the Mobile section is showing. The QR
  // pairing dialog owns the server's lifecycle; here we just poll its status so
  // the panel shows whether a phone can currently connect.
  useEffect(() => {
    if (!open || active !== 'mobile') return
    let cancelled = false
    const refresh = (): void => {
      void window.api.mobile.status().then((s) => {
        if (!cancelled) setMobileStatus(s)
      })
    }
    refresh()
    const timer = window.setInterval(refresh, 2000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [open, active])

  if (!open) return null

  const choosePanelSide = (side: PanelSide): void => setPanelSide(side)
  const mobileRunning = Boolean(mobileStatus?.running)
  const mobileDevices = mobileStatus?.devices ?? []
  const copyMobileUrl = (): void => {
    if (!mobileStatus?.url) return
    window.api.writeClipboardText(mobileStatus.url)
    setMobileCopied(true)
    window.setTimeout(() => setMobileCopied(false), 1500)
  }
  const stopMobile = (): void => {
    void window.api.mobile.stop().then((s) => setMobileStatus(s))
  }
  const activeGroup = GROUPS.find((group) => group.items.some((item) => item.id === active))
  const activeItem = activeGroup?.items.find((item) => item.id === active)
  const activeTaskSourceCount = taskSettings.sources.filter((source) => source.enabled).length

  // ---- derived shortcut data ----
  const shortcutKeyCounts = new Map<string, number>()
  for (const s of shortcuts) {
    if (s.keys) shortcutKeyCounts.set(s.keys, (shortcutKeyCounts.get(s.keys) ?? 0) + 1)
  }
  const isConflict = (s: ShortcutBinding): boolean => Boolean(s.keys) && (shortcutKeyCounts.get(s.keys) ?? 0) > 1
  const isModified = (s: ShortcutBinding): boolean => s.keys !== s.defaultKeys
  const shortcutCounts = {
    all: shortcuts.length,
    modified: shortcuts.filter(isModified).length,
    unassigned: shortcuts.filter((s) => !s.keys).length,
    conflicts: shortcuts.filter(isConflict).length
  }
  const normalizedQuery = shortcutQuery.trim().toLowerCase()
  const filteredShortcuts = shortcuts.filter((s) => {
    if (shortcutStatus === 'modified' && !isModified(s)) return false
    if (shortcutStatus === 'unassigned' && s.keys) return false
    if (shortcutStatus === 'conflicts' && !isConflict(s)) return false
    if (!normalizedQuery) return true
    return (
      s.label.toLowerCase().includes(normalizedQuery) ||
      s.keys.toLowerCase().includes(normalizedQuery) ||
      s.group.toLowerCase().includes(normalizedQuery)
    )
  })
  const shortcutGroups = Array.from(new Set(filteredShortcuts.map((s) => s.group))).map((group) => ({
    group,
    items: filteredShortcuts.filter((s) => s.group === group)
  }))
  const shortcutStatusFilters: { id: ShortcutStatus; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: shortcutCounts.all },
    { id: 'modified', label: 'Modified', count: shortcutCounts.modified },
    { id: 'unassigned', label: 'Unassigned', count: shortcutCounts.unassigned },
    { id: 'conflicts', label: 'Conflicts', count: shortcutCounts.conflicts }
  ]

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

  const updateServerDraft = (field: keyof typeof serverDraft, value: string): void => {
    setServerDraft((draft) => ({ ...draft, [field]: value }))
    if (serverError) setServerError('')
  }

  const addServer = (event?: FormEvent<HTMLFormElement>): void => {
    event?.preventDefault()
    const name = serverDraft.name.trim()
    const host = normalizeHost(serverDraft.host)
    if (!host) {
      setServerError('Enter a server host or URL.')
      return
    }
    if (!isValidRemoteHost(host)) {
      setServerError('Use host:port, http://host:port, or https://host:port.')
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
  const usageDetailModel = usageDetailId
    ? usageModels.find((m) => m.model.id === usageDetailId)?.model ?? null
    : null

  const connectModel = (modelId: string): void => {
    addSession(modelId)
    setUsageDetailId(null)
    toggleSettings(false)
  }

  const sendTestNotification = (): void => {
    if (typeof Notification === 'undefined') {
      setNotificationTest('Notifications are not supported on this device.')
      return
    }
    const show = (): void => {
      const sound = notificationSettings.sound
      // Native notification audio is unreliable across platforms, so play the
      // selected alert ourselves — the same sound an AI run completion fires.
      playNotificationSound(sound)
      new Notification('GenNal', {
        body: 'This is a test notification.',
        silent: true
      })
      setNotificationTest('Test notification sent.')
    }
    if (Notification.permission === 'granted') {
      show()
    } else if (Notification.permission === 'denied') {
      setNotificationTest('Notifications are blocked. Enable them in your system settings.')
    } else {
      void Notification.requestPermission().then((permission) => {
        if (permission === 'granted') show()
        else setNotificationTest('Notification permission was not granted.')
      })
    }
  }

  return (
    <Modal onClose={() => toggleSettings(false)}>
      <section
        className="settings-shell"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        <aside className="settings-nav">
          <div className="settings-nav-title">Settings</div>
          {GROUPS.map((group) => (
            <div className="settings-group" key={group.title}>
              <div className="settings-group-title">{group.title}</div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  className={`settings-nav-item ${active === item.id ? 'active' : ''}`}
                  onClick={() => {
                    setActive(item.id)
                    setUsageDetailId(null)
                  }}
                >
                  <NavIcon name={item.icon} />
                  <span>{item.label}</span>
                  {item.badge && <span className="settings-badge">{item.badge}</span>}
                </button>
              ))}
            </div>
          ))}

          {recentProjects.length > 0 && (
            <div className="settings-group" key="projects">
              <div className="settings-group-title">Projects</div>
              {recentProjects.map((project) => {
                const isActive =
                  active === 'project' && projectPath?.toLowerCase() === project.path.toLowerCase()
                const ps = projectSettings[project.path.toLowerCase()]
                const label = ps?.displayName?.trim() || project.name
                const accent = ps?.color ?? projectAccent(project.path)
                return (
                  <button
                    key={project.path}
                    className={`settings-nav-item settings-project-item ${isActive ? 'active' : ''}`}
                    title={project.path}
                    onClick={() => {
                      setActive('project')
                      setProjectPath(project.path)
                      setUsageDetailId(null)
                    }}
                  >
                    <span className="settings-project-mono" style={{ background: accent }}>
                      {ps?.iconMode === 'emoji' && ps.emoji
                        ? ps.emoji
                        : ps?.iconMode === 'avatar' && ps.image
                          ? <img className="settings-project-img" src={ps.image} alt="" />
                          : label.trim().charAt(0).toUpperCase() || 'P'}
                    </span>
                    <span className="settings-project-name">{label}</span>
                  </button>
                )
              })}
            </div>
          )}
        </aside>

        <main className="settings-main">
          {active === 'project' && projectPath ? (
            <ProjectSettingsPanel
              path={projectPath}
              onClose={() => toggleSettings(false)}
              onDeleted={() => {
                setActive('appearance')
                setProjectPath(null)
              }}
            />
          ) : (
          <>
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
                  <button className="settings-close" onClick={() => void browseProject()}>Open project</button>
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
              <div className="settings-section-head">
                <h4>Windows Shell</h4>
                <p>Default shell for new terminal panes on Windows.</p>
              </div>
              <div className="settings-card">
                <div>
                  <h3>Default Shell</h3>
                  <p>Shell used when opening a new terminal pane. Takes effect for new terminals.</p>
                </div>
                <div className="settings-segment">
                  {([['powershell', 'PowerShell'], ['cmd', 'Command Prompt'], ['gitbash', 'Git Bash'], ['wsl', 'WSL']] as const).map(([id, label]) => (
                    <button key={id} className={terminalSettings.windowsShell === id ? 'active' : ''} onClick={() => setTerminalSettings({ windowsShell: id })}>{label}</button>
                  ))}
                </div>
              </div>

              <div className="settings-section-head">
                <h4>Rendering</h4>
                <p>Terminal renderer behavior for live panes and new panes.</p>
              </div>
              <div className="settings-card">
                <div>
                  <h3>GPU Acceleration</h3>
                  <p>Auto tries WebGL, with DOM fallback for unsupported or risky renderers.</p>
                </div>
                <div className="settings-segment">
                  {([['auto', 'Auto'], ['on', 'On'], ['off', 'Off']] as const).map(([id, label]) => (
                    <button key={id} className={terminalSettings.gpuAcceleration === id ? 'active' : ''} onClick={() => setTerminalSettings({ gpuAcceleration: id })}>{label}</button>
                  ))}
                </div>
              </div>

              <div className="settings-section-head">
                <h4>Terminal Interaction</h4>
                <p>Mouse and clipboard behavior for terminal panes.</p>
              </div>
              {([
                { key: 'rightClickPaste', title: 'Right-click to paste', desc: 'On Windows, right-click pastes the clipboard. Ctrl+right-click opens the context menu.' },
                { key: 'focusFollowsMouse', title: 'Focus Follows Mouse', desc: 'Hovering a terminal pane activates it without needing to click.' },
                { key: 'copyOnSelect', title: 'Copy on Select', desc: 'Automatically copy terminal selections to the clipboard.' },
                { key: 'osc52', title: 'Allow TUI Clipboard Writes (OSC 52)', desc: 'Let programs in the terminal (tmux, Neovim, fzf, SSH) copy to your system clipboard.' }
              ] as const).map((row) => {
                const on = terminalSettings[row.key]
                return (
                  <div className="settings-card" key={row.key}>
                    <div>
                      <h3>{row.title}</h3>
                      <p>{row.desc}</p>
                    </div>
                    <button
                      className={`task-toggle ${on ? 'on' : ''}`}
                      aria-pressed={on}
                      aria-label={row.title}
                      onClick={() => setTerminalSettings({ [row.key]: !on } as Parameters<typeof setTerminalSettings>[0])}
                    >
                      <span />
                    </button>
                  </div>
                )
              })}

              <div className="settings-section-head">
                <h4>Workspace Setup Script</h4>
                <p>Where the repository setup script runs when a new workspace is created.</p>
              </div>
              <div className="settings-card">
                <div>
                  <h3>Setup Script Location</h3>
                  <p>“New Tab” opens the setup command in a background tab titled “Setup” without stealing focus.</p>
                </div>
                <div className="settings-segment">
                  {([['newtab', 'New Tab'], ['vertical', 'Split Vertically'], ['horizontal', 'Split Horizontally']] as const).map(([id, label]) => (
                    <button key={id} className={terminalSettings.setupScriptLocation === id ? 'active' : ''} onClick={() => setTerminalSettings({ setupScriptLocation: id })}>{label}</button>
                  ))}
                </div>
              </div>

              <div className="settings-section-head">
                <h4>Manage Sessions</h4>
                <p>Recover from a frozen or misbehaving terminal by killing sessions or restarting the underlying daemon.</p>
              </div>
              <div className="settings-sessions">
                <div className="ss-head">
                  <span className="ss-title">Sessions ({sessions.length})</span>
                  <button
                    className="ss-head-btn"
                    title="Kill all sessions"
                    aria-label="Kill all sessions"
                    disabled={sessions.length === 0}
                    onClick={() => sessions.forEach((s) => removeSession(s.id))}
                  >
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 4.5h10M6.5 4.5V3.6a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v.9M4.8 4.5l.55 8a1 1 0 0 0 1 .93h3.3a1 1 0 0 0 1-.93l.55-8" />
                    </svg>
                  </button>
                </div>
                {sessions.length === 0 ? (
                  <div className="ss-empty">No active terminal sessions.</div>
                ) : (
                  sessions.map((s) => (
                    <div className="ss-row" key={s.id}>
                      <span className={`ss-dot ${s.status === 'running' ? 'on' : ''}`} aria-hidden="true" />
                      <span className="ss-name">{s.cwd ?? s.label}</span>
                      <span className="ss-id">{s.id}::{s.cwd ?? '~'}</span>
                      <button className="ss-kill" aria-label={`Kill ${s.label}`} onClick={() => removeSession(s.id)}>×</button>
                    </div>
                  ))
                )}
              </div>

              <div className="settings-section-head">
                <h4>Advanced</h4>
                <p>Scrollback, word boundaries, and platform-specific terminal behaviors.</p>
              </div>
              <div className="settings-card">
                <div>
                  <h3>Scrollback Size</h3>
                  <p>Maximum terminal scrollback buffer size for new terminal panes.</p>
                </div>
                <div className="settings-segment">
                  {[10, 25, 50, 100, 250].map((mb) => (
                    <button key={mb} className={terminalSettings.scrollbackMB === mb ? 'active' : ''} onClick={() => setTerminalSettings({ scrollbackMB: mb })}>{mb} MB</button>
                  ))}
                  <button
                    className={![10, 25, 50, 100, 250].includes(terminalSettings.scrollbackMB) ? 'active' : ''}
                    onClick={async () => {
                      const v = await prompt({
                        title: 'Custom scrollback',
                        label: 'Buffer size in MB (1–2000)',
                        initialValue: String(terminalSettings.scrollbackMB),
                        confirmLabel: 'Set'
                      })
                      if (v === null) return
                      const n = Number(v)
                      if (Number.isFinite(n) && n > 0 && n <= 2000) setTerminalSettings({ scrollbackMB: n })
                    }}
                  >
                    Custom
                  </button>
                </div>
              </div>
              <div className="settings-card">
                <div>
                  <h3>Word Separators</h3>
                  <p>Characters treated as word boundaries for double-click selection.</p>
                </div>
                <input
                  className="settings-text-input"
                  value={terminalSettings.wordSeparators}
                  spellCheck={false}
                  onChange={(e) => setTerminalSettings({ wordSeparators: e.target.value })}
                />
              </div>
              <div className="settings-card">
                <div>
                  <h3>PowerShell Version</h3>
                  <p>
                    Auto uses Windows PowerShell now and switches to PowerShell 7+ when installed.{' '}
                    <button
                      className="settings-link"
                      onClick={() => window.open('https://learn.microsoft.com/powershell/scripting/install/installing-powershell', '_blank', 'noopener,noreferrer')}
                    >
                      Download PowerShell 7+
                    </button>
                    .
                  </p>
                </div>
                <div className="settings-segment">
                  {([['auto', 'Auto'], ['windows', 'Windows PowerShell'], ['pwsh7', 'PowerShell 7+']] as const).map(([id, label]) => (
                    <button key={id} className={terminalSettings.powershellVersion === id ? 'active' : ''} onClick={() => setTerminalSettings({ powershellVersion: id })}>{label}</button>
                  ))}
                </div>
              </div>

              <div className="settings-section-head">
                <h4>Appearance</h4>
                <p>Font and cursor for terminal panes.</p>
              </div>
              <div className="settings-card">
                <div>
                  <h3>Font size</h3>
                  <p>Terminal text size used by every pane.</p>
                </div>
                <div className="settings-segment">
                  {[11, 12.5, 14, 16].map((size) => (
                    <button key={size} className={terminalSettings.fontSize === size ? 'active' : ''} onClick={() => setTerminalSettings({ fontSize: size })}>{size}</button>
                  ))}
                </div>
              </div>
              <div className="settings-card terminal-font-card">
                <div>
                  <h3>Font family</h3>
                  <p>Monospace font stack for xterm panes.</p>
                </div>
                <div className="terminal-font-options">
                  {TERMINAL_FONT_OPTIONS.map((font) => (
                    <button key={font} className={terminalSettings.fontFamily === font ? 'active' : ''} style={{ fontFamily: font }} onClick={() => setTerminalSettings({ fontFamily: font })}>{font.split(',')[0]}</button>
                  ))}
                </div>
              </div>
              <div className="settings-card task-options-card">
                <div>
                  <h3>Behavior</h3>
                  <p>Cursor blink and session launch focus.</p>
                </div>
                <div className="task-option-list">
                  <label className="task-check">
                    <input type="checkbox" checked={terminalSettings.cursorBlink} onChange={(e) => setTerminalSettings({ cursorBlink: e.target.checked })} />
                    <span>Blink terminal cursor</span>
                  </label>
                  <label className="task-check">
                    <input type="checkbox" checked={terminalSettings.focusNewSessions} onChange={(e) => setTerminalSettings({ focusNewSessions: e.target.checked })} />
                    <span>Focus newly launched sessions</span>
                  </label>
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
                <form className="remote-form" onSubmit={addServer}>
                  <div className="remote-form-row">
                    <input
                      aria-label="Server name"
                      placeholder="Name (e.g. Workstation)"
                      value={serverDraft.name}
                      maxLength={40}
                      onChange={(event) => updateServerDraft('name', event.target.value)}
                    />
                    <input
                      aria-label="Server host or URL"
                      placeholder="host:port or https://…"
                      value={serverDraft.host}
                      aria-invalid={Boolean(serverError)}
                      onChange={(event) => updateServerDraft('host', event.target.value)}
                    />
                  </div>
                  <div className="remote-form-row">
                    <input
                      aria-label="Access token"
                      type="password"
                      placeholder="Access token (optional)"
                      value={serverDraft.token}
                      onChange={(event) => updateServerDraft('token', event.target.value)}
                    />
                    <button className="remote-add-btn" type="submit">Add server</button>
                  </div>
                  {serverError && <p className="remote-error">{serverError}</p>}
                </form>
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
              {usageDetailModel ? (
                <UsageDetail
                  model={usageDetailModel}
                  onBack={() => setUsageDetailId(null)}
                  onConnect={() => connectModel(usageDetailModel.id)}
                />
              ) : (
              <>
              <ProvidersUsage />

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
                <div className="usage-head-actions">
                  <span className={`usage-status-pill ${connectedModels > 0 ? 'on' : ''}`}>
                    {connectedModels > 0 ? `${connectedModels} online` : 'None connected'}
                  </span>
                  <button className="usage-add-btn" onClick={() => toggleAddModel(true)}>
                    + Add model
                  </button>
                </div>
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
                    <div className="usage-actions">
                      <span className={`usage-badge ${connected ? 'on' : ''}`}>
                        <span className="usage-dot" />
                        {connected ? 'Connected' : 'Idle'}
                      </span>
                      <button
                        className="usage-see"
                        onClick={() => setUsageDetailId(model.id)}
                        title={`See ${model.label} usage`}
                      >
                        See usage
                      </button>
                      <button
                        className={`usage-connect ${connected ? 'on' : ''}`}
                        onClick={() => connectModel(model.id)}
                        title={connected ? `Launch another ${model.label} session` : `Connect ${model.label}`}
                      >
                        {connected ? 'New session' : 'Connect'}
                      </button>
                      {model.custom && (
                        <button
                          className="usage-remove"
                          onClick={() => void removeModel(model.id)}
                          title={`Remove ${model.label}`}
                          aria-label={`Remove ${model.label}`}
                        >
                          <svg viewBox="0 0 16 16" width="13" height="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                            <path d="M4 4l8 8M12 4l-8 8" />
                          </svg>
                        </button>
                      )}
                    </div>
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
              </>
              )}
            </div>
          ) : active === 'privacy' ? (
            <div className="settings-content privacy-panel">
              <div className="settings-summary-grid">
                <div className="settings-summary">
                  <span>Telemetry</span>
                  <strong>{privacySettings.telemetry ? 'On' : 'Off'}</strong>
                </div>
                <div className="settings-summary">
                  <span>Secret redaction</span>
                  <strong>{privacySettings.redactSecrets ? 'On' : 'Off'}</strong>
                </div>
                <div className="settings-summary">
                  <span>Clear on exit</span>
                  <strong>{privacySettings.clearOnExit ? 'On' : 'Off'}</strong>
                </div>
                <div className="settings-summary">
                  <span>Chat history</span>
                  <strong>{chatHistory.length}</strong>
                </div>
              </div>

              <div className="settings-card privacy-intro-card">
                <div>
                  <h3>Your data stays on this device</h3>
                  <p>
                    GenNal runs AI models locally through their CLIs. Nothing is sent to GenNal
                    servers unless you explicitly turn on the options below.
                  </p>
                </div>
              </div>

              {PRIVACY_TOGGLES.map((toggle) => {
                const enabled = privacySettings[toggle.key]
                return (
                  <div className="settings-card" key={toggle.key}>
                    <div>
                      <h3>{toggle.title}</h3>
                      <p>{toggle.description}</p>
                    </div>
                    <button
                      className={`task-toggle ${enabled ? 'on' : ''}`}
                      aria-pressed={enabled}
                      aria-label={toggle.title}
                      onClick={() => setPrivacySettings({ [toggle.key]: !enabled })}
                    >
                      <span />
                    </button>
                  </div>
                )
              })}

              <div className="settings-card privacy-history-card">
                <div>
                  <h3>Chat history</h3>
                  <p>Recent chat prompts and model replies stored locally on this device.</p>
                </div>
                <button
                  className="settings-close danger"
                  disabled={chatHistory.length === 0}
                  onClick={clearChatHistory}
                >
                  Clear chat
                </button>
              </div>

              {chatHistory.length === 0 ? (
                <div className="settings-placeholder remote-empty chat-history-empty">
                  <h3>No chat history</h3>
                  <p>Completed chats will appear here when history is enabled.</p>
                </div>
              ) : (
                <div className="chat-history-list" aria-label="Chat history">
                  {chatHistory.slice(0, 12).map((entry) => {
                    const userMessage = entry.messages.find((message) => message.role === 'user')
                    const assistantMessage = entry.messages.find((message) => message.role === 'assistant')
                    return (
                      <div className="chat-history-card" key={entry.id}>
                        <div className="chat-history-head">
                          <span>{entry.modelLabel}</span>
                          <time dateTime={entry.createdAt}>{formatHistoryDate(entry.createdAt)}</time>
                        </div>
                        <p className="chat-history-prompt">{userMessage?.text ?? 'Prompt unavailable'}</p>
                        {assistantMessage && (
                          <p className={`chat-history-reply${assistantMessage.error ? ' error' : ''}`}>
                            {assistantMessage.text}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="settings-card privacy-danger-card">
                <div>
                  <h3>Clear local data now</h3>
                  <p>
                    Remove stored history, workspace references, saved servers, and task sources from
                    this device. Your theme, profile, and preferences are kept.
                  </p>
                  {dataCleared && <p className="privacy-cleared-note">Local data cleared.</p>}
                </div>
                <button
                  className="settings-close danger"
                  onClick={() => {
                    clearLocalData()
                    setDataCleared(true)
                  }}
                >
                  Clear data
                </button>
              </div>

              <p className="remote-note">Privacy preferences are stored locally on this device.</p>
            </div>
          ) : active === 'notifications' ? (
            <div className="settings-content notifications-panel">
              <div className="settings-section-head">
                <h4>Notifications</h4>
                <p>Native desktop notifications for agent activity and terminal events.</p>
              </div>

              <div className="settings-card">
                <div>
                  <h3>Enable Notifications</h3>
                  <p>Native system notifications for background events.</p>
                </div>
                <button
                  className={`task-toggle ${notificationSettings.enabled ? 'on' : ''}`}
                  aria-pressed={notificationSettings.enabled}
                  aria-label="Enable Notifications"
                  onClick={() => setNotificationSettings({ enabled: !notificationSettings.enabled })}
                >
                  <span />
                </button>
              </div>

              <div className={`settings-card${notificationSettings.enabled ? '' : ' is-disabled'}`}>
                <div>
                  <h3 className="settings-card-title">
                    <NavIcon name="check" />
                    Agent Task Complete
                  </h3>
                  <p>A coding agent finishes and becomes idle.</p>
                </div>
                <button
                  className={`task-toggle ${notificationSettings.agentTaskComplete ? 'on' : ''}`}
                  aria-pressed={notificationSettings.agentTaskComplete}
                  aria-label="Agent Task Complete"
                  disabled={!notificationSettings.enabled}
                  onClick={() =>
                    setNotificationSettings({ agentTaskComplete: !notificationSettings.agentTaskComplete })
                  }
                >
                  <span />
                </button>
              </div>

              <div className={`settings-card${notificationSettings.enabled ? '' : ' is-disabled'}`}>
                <div>
                  <h3 className="settings-card-title">
                    <NavIcon name="play" />
                    AI Run Sound Alert
                  </h3>
                  <p>Play a sound when an AI run finishes in a terminal pane.</p>
                </div>
                <button
                  className={`task-toggle ${notificationSettings.runCompleteSound ? 'on' : ''}`}
                  aria-pressed={notificationSettings.runCompleteSound}
                  aria-label="AI Run Sound Alert"
                  disabled={!notificationSettings.enabled}
                  onClick={() =>
                    setNotificationSettings({ runCompleteSound: !notificationSettings.runCompleteSound })
                  }
                >
                  <span />
                </button>
              </div>

              <div className={`settings-card${notificationSettings.enabled ? '' : ' is-disabled'}`}>
                <div>
                  <h3 className="settings-card-title">
                    <NavIcon name="bell" />
                    Terminal Bell
                  </h3>
                  <p>A background terminal emits a bell character.</p>
                </div>
                <button
                  className={`task-toggle ${notificationSettings.terminalBell ? 'on' : ''}`}
                  aria-pressed={notificationSettings.terminalBell}
                  aria-label="Terminal Bell"
                  disabled={!notificationSettings.enabled}
                  onClick={() => setNotificationSettings({ terminalBell: !notificationSettings.terminalBell })}
                >
                  <span />
                </button>
              </div>

              <div className={`settings-card notification-sound-card${notificationSettings.enabled ? '' : ' is-disabled'}`}>
                <div>
                  <h3 className="settings-card-title">
                    <NavIcon name="terminal" />
                    Notification Sound
                  </h3>
                  <p>Choose the alert GenNal plays when a desktop notification is delivered.</p>
                  <select
                    className="settings-select"
                    value={notificationSettings.sound}
                    disabled={!notificationSettings.enabled}
                    onChange={(event) =>
                      setNotificationSettings({ sound: event.target.value as NotificationSound })
                    }
                    aria-label="Notification Sound"
                  >
                    {NOTIFICATION_SOUND_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={`settings-card${notificationSettings.enabled ? '' : ' is-disabled'}`}>
                <div>
                  <h3>Suppress While Focused</h3>
                  <p>Skip notifications when the triggering worktree is already visible.</p>
                </div>
                <button
                  className={`task-toggle ${notificationSettings.suppressWhileFocused ? 'on' : ''}`}
                  aria-pressed={notificationSettings.suppressWhileFocused}
                  aria-label="Suppress While Focused"
                  disabled={!notificationSettings.enabled}
                  onClick={() =>
                    setNotificationSettings({ suppressWhileFocused: !notificationSettings.suppressWhileFocused })
                  }
                >
                  <span />
                </button>
              </div>

              <div className="settings-test-row">
                <button className="settings-close" onClick={sendTestNotification}>
                  <NavIcon name="bell" />
                  Send Test Notification
                </button>
                {notificationTest && <span className="settings-test-note">{notificationTest}</span>}
              </div>

              <p className="remote-note">Notification preferences are stored locally on this device.</p>
            </div>
          ) : active === 'input' ? (
            <div className="settings-content editor-panel">
              <div className="settings-summary-grid">
                <div className="settings-summary">
                  <span>Indent</span>
                  <strong>{editorSettings.insertSpaces ? `${editorSettings.tabSize} spaces` : 'Tabs'}</strong>
                </div>
                <div className="settings-summary">
                  <span>Word wrap</span>
                  <strong>{editorSettings.wordWrap ? 'On' : 'Off'}</strong>
                </div>
                <div className="settings-summary">
                  <span>Font size</span>
                  <strong>{editorSettings.fontSize}px</strong>
                </div>
              </div>

              <div className="settings-card editor-preview-card">
                <div>
                  <h3>Editor preview</h3>
                  <p>These preferences apply to the code editor in the side panel.</p>
                </div>
                <pre
                  className={`editor-preview${editorSettings.wordWrap ? ' wrap' : ''}`}
                  style={{ fontSize: editorSettings.fontSize, tabSize: editorSettings.tabSize }}
                >
                  {editorSettings.lineNumbers && <span className="editor-preview-gutter">1{'\n'}2{'\n'}3</span>}
                  <span className="editor-preview-code">{`function greet(name) {\n${editorSettings.insertSpaces ? ' '.repeat(editorSettings.tabSize) : '\t'}return 'Hello, ' + name\n}`}</span>
                </pre>
              </div>

              <div className="settings-card">
                <div>
                  <h3>Tab size</h3>
                  <p>Number of spaces inserted when you press Tab.</p>
                </div>
                <div className="settings-grid-actions">
                  {[2, 4, 8].map((size) => (
                    <button
                      key={size}
                      className={editorSettings.tabSize === size ? 'active' : ''}
                      onClick={() => setEditorSettings({ tabSize: size })}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-card">
                <div>
                  <h3>Editor font size</h3>
                  <p>Set the text size used in the code editor.</p>
                </div>
                <div className="settings-grid-actions">
                  {[12, 13, 14, 16].map((size) => (
                    <button
                      key={size}
                      className={editorSettings.fontSize === size ? 'active' : ''}
                      onClick={() => setEditorSettings({ fontSize: size })}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-card task-options-card">
                <div>
                  <h3>Behavior</h3>
                  <p>How the editor handles indentation, wrapping, and typing.</p>
                </div>
                <div className="task-option-list">
                  <label className="task-check">
                    <input
                      type="checkbox"
                      checked={editorSettings.insertSpaces}
                      onChange={(event) => setEditorSettings({ insertSpaces: event.target.checked })}
                    />
                    <span>Insert spaces instead of tabs</span>
                  </label>
                  <label className="task-check">
                    <input
                      type="checkbox"
                      checked={editorSettings.wordWrap}
                      onChange={(event) => setEditorSettings({ wordWrap: event.target.checked })}
                    />
                    <span>Wrap long lines</span>
                  </label>
                  <label className="task-check">
                    <input
                      type="checkbox"
                      checked={editorSettings.lineNumbers}
                      onChange={(event) => setEditorSettings({ lineNumbers: event.target.checked })}
                    />
                    <span>Show line numbers</span>
                  </label>
                  <label className="task-check">
                    <input
                      type="checkbox"
                      checked={editorSettings.spellCheck}
                      onChange={(event) => setEditorSettings({ spellCheck: event.target.checked })}
                    />
                    <span>Check spelling while typing</span>
                  </label>
                </div>
              </div>

              <p className="remote-note">Editor preferences are stored locally on this device.</p>
            </div>
          ) : active === 'shortcuts' ? (
            <div className="settings-content shortcuts-panel">
              <div className="settings-card shortcuts-precedence">
                <div>
                  <h3>Shortcuts in Terminal</h3>
                  <p>Decide who first intercepts shortcuts while a terminal is focused.</p>
                </div>
                <div className="settings-grid-actions">
                  <button
                    className={terminalPrecedence === 'app' ? 'active' : ''}
                    onClick={() => chooseTerminalPrecedence('app')}
                  >
                    GenNal first
                  </button>
                  <button
                    className={terminalPrecedence === 'terminal' ? 'active' : ''}
                    onClick={() => chooseTerminalPrecedence('terminal')}
                  >
                    Terminal first
                  </button>
                </div>
              </div>

              <div className="shortcuts-toolbar">
                <div className="shortcut-search">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
                    <circle cx="7" cy="7" r="4.5" />
                    <path d="M10.5 10.5 14 14" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search command or keys"
                    value={shortcutQuery}
                    onChange={(event) => setShortcutQuery(event.target.value)}
                  />
                  <span className="shortcut-count">
                    {filteredShortcuts.length}/{shortcuts.length}
                  </span>
                </div>
                <button className="shortcut-reset-all" onClick={resetShortcuts}>
                  Reset to defaults
                </button>
              </div>

              <div className="shortcut-status-filters">
                {shortcutStatusFilters.map((filter) => (
                  <button
                    key={filter.id}
                    className={`shortcut-status-chip ${shortcutStatus === filter.id ? 'active' : ''}`}
                    onClick={() => setShortcutStatus(filter.id)}
                  >
                    <span>{filter.label}</span>
                    <span className="shortcut-status-count">{filter.count}</span>
                  </button>
                ))}
              </div>

              <div className="shortcut-groups">
                {shortcutGroups.length === 0 ? (
                  <p className="shortcut-empty">No shortcuts match your search.</p>
                ) : (
                  shortcutGroups.map(({ group, items }) => (
                    <div className="shortcut-group" key={group}>
                      <div className="shortcut-group-title">{group}</div>
                      {items.map((s) => {
                        const recording = recordingId === s.id
                        const conflict = isConflict(s)
                        return (
                          <div className={`shortcut-row ${conflict ? 'conflict' : ''}`} key={s.id}>
                            <div className="shortcut-row-info">
                              <span className="shortcut-row-label">{s.label}</span>
                              <span className="shortcut-scope">{group}</span>
                            </div>
                            <div className="shortcut-row-keys">
                              {recording ? (
                                <button className="shortcut-keys recording" onClick={() => setRecordingId(null)}>
                                  Press keys… (Esc to cancel)
                                </button>
                              ) : s.keys ? (
                                <button
                                  className="shortcut-keys"
                                  title="Click to re-record"
                                  onClick={() => setRecordingId(s.id)}
                                >
                                  {comboParts(s.keys).map((part, index) => (
                                    <kbd key={index}>{part}</kbd>
                                  ))}
                                </button>
                              ) : (
                                <button className="shortcut-add" onClick={() => setRecordingId(s.id)}>
                                  <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                                    <path d="M7 2.5v9M2.5 7h9" />
                                  </svg>
                                  Add shortcut
                                </button>
                              )}
                              {isModified(s) && !recording && (
                                <button
                                  className="shortcut-row-reset"
                                  title="Reset to default"
                                  aria-label={`Reset ${s.label} to default`}
                                  onClick={() => updateShortcut(s.id, s.defaultKeys)}
                                >
                                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M13 3v3h-3" />
                                    <path d="M13 6A5.5 5.5 0 1 0 13.5 9" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ))
                )}
              </div>

              <p className="remote-note">Shortcuts are stored locally on this device.</p>
            </div>
          ) : active === 'mobile' ? (
            <div className="settings-content remote-panel">
              <div className="settings-summary-grid">
                <div className="settings-summary">
                  <span>Status</span>
                  <strong>
                    {mobileRunning
                      ? mobileDevices.length > 0
                        ? `${mobileDevices.length} device${mobileDevices.length === 1 ? '' : 's'}`
                        : 'Online'
                      : 'Off'}
                  </strong>
                </div>
                <div className="settings-summary">
                  <span>Shared terminals</span>
                  <strong>{sessions.length}</strong>
                </div>
                <div className="settings-summary">
                  <span>Project</span>
                  <strong>{workspace?.kind === 'project' ? workspace.name : 'None'}</strong>
                </div>
              </div>

              <div className="settings-card remote-add-card">
                <div>
                  <h3>GenNal Mobile</h3>
                  <p>
                    Pair a phone over your local Wi-Fi to chat with your models and drive open terminals
                    from anywhere in the room. Pairing opens a QR code; the server runs only while that
                    window is open.
                  </p>
                </div>
                <div className="remote-form-row">
                  <button className="remote-add-btn" type="button" onClick={() => toggleMobile(true)}>
                    {mobileRunning ? 'Show pairing code' : 'Pair a device'}
                  </button>
                  {mobileRunning && (
                    <button className="remote-add-btn stop" type="button" onClick={stopMobile}>
                      Stop sharing
                    </button>
                  )}
                </div>
              </div>

              {mobileRunning && (
                <div className="remote-card connected">
                  <span className="remote-status" />
                  <div className="remote-copy">
                    <div className="remote-card-head">
                      <h3>This computer</h3>
                      <span>Online</span>
                    </div>
                    <p>{mobileStatus?.displayUrl ?? mobileStatus?.host ?? 'Reachable on your network'}</p>
                  </div>
                  <div className="remote-card-actions">
                    <button className="remote-connect on" onClick={copyMobileUrl} disabled={!mobileStatus?.url}>
                      {mobileCopied ? 'Copied' : 'Copy link'}
                    </button>
                  </div>
                </div>
              )}

              {mobileDevices.length > 0 ? (
                mobileDevices.map((device) => (
                  <div className="remote-card connected" key={device.id}>
                    <span className="remote-status" />
                    <div className="remote-copy">
                      <div className="remote-card-head">
                        <h3>{device.name}</h3>
                        <span>Connected</span>
                      </div>
                      <p>{device.ip}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="settings-placeholder remote-empty">
                  <h3>{mobileRunning ? 'Waiting for a device…' : 'No device paired'}</h3>
                  <p>
                    {mobileRunning
                      ? 'Scan the QR code with your phone. It will appear here by name once connected.'
                      : 'Choose “Pair a device” to show a QR code your phone can scan.'}
                  </p>
                </div>
              )}

              <p className="remote-note">
                The link carries a one-time pairing token, and the connection runs commands on this
                computer — only pair devices you trust. Sharing keeps running in the background until you
                choose “Stop sharing” or quit GenNal.
              </p>
            </div>
          ) : (
            <div className="settings-placeholder">
              <h3>{activeItem?.label}</h3>
              <p>This section is ready for configuration controls.</p>
            </div>
          )}
          </>
          )}
        </main>
      </section>
    </Modal>
  )
}
