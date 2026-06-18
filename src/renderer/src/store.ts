import { create } from 'zustand'
import type {
  ModelDef,
  RunExit,
  RunOutput,
  SessionStatus,
  SystemStats,
  WorkspaceFile,
  WorkspaceKind,
  WorkspaceOpenPathPayload,
  WorkspaceOpenResult
} from '../../shared/types'

export interface Session {
  id: string
  modelId: string
  label: string
  tag: string
  accent: string
  command: string
  status: SessionStatus
  cwd?: string
  /**
   * Path of the project this terminal belongs to, captured when it was created.
   * Sessions are scoped to their project: switching projects shows only that
   * project's terminals. `undefined` means it was created with no project open.
   */
  projectPath?: string
}

export type LayoutMode = 'grid' | 'tabs' | 'stack' | 'float'
export type PanelSide = 'left' | 'right'
export type CodePanelTab = 'CODE' | 'CHAT' | 'OUTPUT' | 'TERMINAL' | 'PROBLEMS' | 'PREVIEW'
export type ThemeName =
  | 'dark'
  | 'light'
  | 'midnight'
  | 'ocean'
  | 'forest'
  | 'sunset'
  | 'rose'
  | 'nord'
  | 'slate'
  | 'graphite'
  | 'stone'

export const THEME_NAMES: ThemeName[] = [
  'dark',
  'light',
  'midnight',
  'ocean',
  'forest',
  'sunset',
  'rose',
  'nord',
  'slate',
  'graphite',
  'stone'
]

export interface Profile {
  name: string
  role: string
  avatar: string
}

export interface GeneralSettings {
  restoreWorkspaceOnLaunch: boolean
}

export interface BrowserSettings {
  homeUrl: string
  openExternal: boolean
  saveHistory: boolean
  attachWorkspaceContext: boolean
}

export type WindowsShell = 'powershell' | 'cmd' | 'gitbash' | 'wsl'
export type GpuAcceleration = 'auto' | 'on' | 'off'
export type SetupScriptLocation = 'newtab' | 'vertical' | 'horizontal'
export type PowerShellVersion = 'auto' | 'windows' | 'pwsh7'

export interface TerminalSettings {
  fontFamily: string
  fontSize: number
  cursorBlink: boolean
  scrollback: number
  focusNewSessions: boolean
  /** Default shell for new plain-shell terminal panes (Windows). */
  windowsShell: WindowsShell
  gpuAcceleration: GpuAcceleration
  /** Right-click pastes the clipboard (Ctrl+right-click opens the menu). */
  rightClickPaste: boolean
  /** Hovering a terminal pane activates it. */
  focusFollowsMouse: boolean
  /** Copy terminal selections to the clipboard automatically. */
  copyOnSelect: boolean
  /** Allow programs to write the clipboard via OSC 52. */
  osc52: boolean
  setupScriptLocation: SetupScriptLocation
  /** Scrollback buffer size in MB (drives the xterm line buffer). */
  scrollbackMB: number
  /** Characters treated as word boundaries for double-click selection. */
  wordSeparators: string
  powershellVersion: PowerShellVersion
}

/** xterm scrollback is line-based; derive a line cap from the MB preference. */
export function scrollbackLines(s: TerminalSettings): number {
  return Math.min(500_000, Math.max(1000, Math.round((s.scrollbackMB || 10) * 1000)))
}

/** True when a path looks like a standalone web page we can open directly. */
function isHtmlPath(path: string): boolean {
  return /\.(html?|xhtml)$/i.test(path)
}

/** Convert an absolute OS path into a file:// URL the webview can load. */
function toFileUrl(path: string): string {
  const normalised = path.replace(/\\/g, '/')
  const withSlash = normalised.startsWith('/') ? normalised : `/${normalised}`
  return `file://${encodeURI(withSlash).replace(/#/g, '%23').replace(/\?/g, '%3F')}`
}

/** Resolve the OS shell command for a Windows-shell preference (renderer side). */
export function windowsShellCommand(shell: WindowsShell): string {
  switch (shell) {
    case 'cmd':
      return 'cmd'
    case 'gitbash':
      return 'gitbash'
    case 'wsl':
      return 'wsl'
    default:
      return 'powershell'
  }
}

export interface PrivacySettings {
  telemetry: boolean
  crashReports: boolean
  rememberHistory: boolean
  rememberWorkspace: boolean
  redactSecrets: boolean
  clearOnExit: boolean
}

export interface EditorSettings {
  fontSize: number
  tabSize: number
  insertSpaces: boolean
  wordWrap: boolean
  lineNumbers: boolean
  spellCheck: boolean
}

export type NotificationSound = 'system' | 'chime' | 'ping' | 'none'

export interface NotificationSettings {
  enabled: boolean
  agentTaskComplete: boolean
  terminalBell: boolean
  sound: NotificationSound
  suppressWhileFocused: boolean
}

export interface ImagePreview {
  name: string
  relativePath: string
  src: string
  size: number
}

/** A project folder the user has opened, kept so it can be reopened quickly. */
export interface RecentProject {
  path: string
  name: string
}

export interface ApplyCodeResult {
  ok: boolean
  message: string
}

export interface ChatHistoryMessage {
  role: 'user' | 'assistant'
  text: string
  error?: boolean
}

export interface ChatHistoryEntry {
  id: string
  modelId: string
  modelLabel: string
  createdAt: string
  messages: ChatHistoryMessage[]
}

export type AutomationSchedule = 'hourly' | 'daily' | 'weekday' | 'weekly'

export const AUTOMATION_SCHEDULE_LABELS: Record<AutomationSchedule, string> = {
  hourly: 'Every hour',
  daily: 'Every day',
  weekday: 'Every weekday',
  weekly: 'Every week'
}

export interface Automation {
  id: string
  name: string
  category: string
  description: string
  prompt: string
  modelId: string
  schedule: AutomationSchedule
  enabled: boolean
  createdAt: string
  lastRunAt?: string
  /** Epoch ms of the next scheduled fire. */
  nextRunAt?: number
}

export type AutomationRunStatus = 'running' | 'success' | 'error'

export interface AutomationRun {
  id: string
  automationId: string
  startedAt: string
  finishedAt?: string
  status: AutomationRunStatus
  trigger: 'manual' | 'schedule'
  output: string
  error?: string
}

export interface AutomationTemplate {
  category: string
  name: string
  description: string
  schedule: AutomationSchedule
  prompt: string
}

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    category: 'REPO HEALTH',
    name: 'Weekday repo audit',
    description: 'Check dependencies, failing tests, and risky open changes each weekday.',
    schedule: 'weekday',
    prompt:
      "Audit this repository's health. Check for outdated or vulnerable dependencies, failing or flaky tests, and risky uncommitted or open changes. Summarize the findings and the most important actions to take."
  },
  {
    category: 'RELEASE PREP',
    name: 'Release readiness',
    description: 'Prepare a weekly release risk summary from the current project state.',
    schedule: 'weekly',
    prompt:
      'Review the current project state and prepare a release readiness summary: highlight risks, incomplete work, recent regressions, and give a clear go / no-go recommendation with reasons.'
  },
  {
    category: 'RECURRING REVIEW',
    name: 'Daily change review',
    description: 'Scan recent work and call out correctness, UX, and test coverage risks.',
    schedule: 'daily',
    prompt:
      'Review the most recent changes in this project. Call out likely correctness bugs, UX problems, and test-coverage gaps. Be concise and specific, and reference files where possible.'
  },
  {
    category: 'MAINTENANCE',
    name: 'Hourly queue check',
    description: 'Look for stuck work, stale generated files, and failed local validation.',
    schedule: 'hourly',
    prompt:
      'Check this project for stuck or stale work: leftover generated files, failed local validation, and anything that looks abandoned or half-finished. Report what needs cleanup and why.'
  }
]

interface AppState {
  models: ModelDef[]
  sessions: Session[]
  activeId: string | null
  rows: number
  cols: number
  mode: LayoutMode
  panelSide: PanelSide
  panelWidth: number
  panelOpen: boolean
  panelMaximized: boolean
  codePanelTab: CodePanelTab
  sidebarOpen: boolean
  stats: SystemStats
  paletteOpen: boolean
  settingsOpen: boolean
  addModelOpen: boolean
  tasksOpen: boolean
  automationsOpen: boolean
  historyOpen: boolean
  githubToken: string
  automations: Automation[]
  automationRuns: AutomationRun[]
  theme: ThemeName
  profile: Profile
  generalSettings: GeneralSettings
  browserSettings: BrowserSettings
  terminalSettings: TerminalSettings
  privacySettings: PrivacySettings
  editorSettings: EditorSettings
  notificationSettings: NotificationSettings
  profileSetupOpen: boolean
  workspace: WorkspaceOpenResult | null
  workspaceError: string | null
  recentProjects: RecentProject[]
  imagePreview: ImagePreview | null
  runOutput: RunOutput[]
  running: boolean
  /** URL currently loaded in the in-app website preview (null = home page). */
  previewUrl: string | null
  /** Bumped to force the preview <webview> to reload the same URL. */
  previewNonce: number
  chatHistory: ChatHistoryEntry[]

  setModels: (m: ModelDef[]) => void
  addModel: (model: Omit<ModelDef, 'id' | 'custom'>) => Promise<void>
  removeModel: (id: string) => Promise<void>
  toggleAddModel: (v?: boolean) => void
  addSession: (modelId: string) => void
  removeSession: (id: string) => void
  setStatus: (id: string, status: SessionStatus) => void
  setActive: (id: string) => void
  setGrid: (rows: number, cols: number) => void
  setMode: (mode: LayoutMode) => void
  setPanelSide: (side: PanelSide) => void
  setPanelWidth: (width: number) => void
  togglePanel: (v?: boolean) => void
  togglePanelMaximized: (v?: boolean) => void
  setCodePanelTab: (tab: CodePanelTab) => void
  toggleSidebar: (v?: boolean) => void
  setStats: (s: SystemStats) => void
  togglePalette: (v?: boolean) => void
  toggleSettings: (v?: boolean) => void
  toggleTasks: (v?: boolean) => void
  toggleAutomations: (v?: boolean) => void
  toggleHistory: (v?: boolean) => void
  setGithubToken: (token: string) => void
  addAutomationFromTemplate: (template: AutomationTemplate) => string
  addBlankAutomation: () => string
  updateAutomation: (id: string, patch: Partial<Automation>) => void
  removeAutomation: (id: string) => void
  runAutomation: (id: string, trigger?: AutomationRun['trigger']) => void
  tickAutomations: () => void
  setTheme: (theme: ThemeName) => void
  setProfile: (profile: Profile) => void
  setGeneralSettings: (settings: Partial<GeneralSettings>) => void
  setBrowserSettings: (settings: Partial<BrowserSettings>) => void
  setTerminalSettings: (settings: Partial<TerminalSettings>) => void
  setPrivacySettings: (settings: Partial<PrivacySettings>) => void
  setEditorSettings: (settings: Partial<EditorSettings>) => void
  setNotificationSettings: (settings: Partial<NotificationSettings>) => void
  clearLocalData: () => void
  addChatHistoryEntry: (entry: Omit<ChatHistoryEntry, 'id' | 'createdAt'>) => void
  clearChatHistory: () => void
  toggleProfileSetup: (v?: boolean) => void
  openWorkspace: (kind: WorkspaceKind) => Promise<void>
  openProject: (path: string) => Promise<void>
  removeRecentProject: (path: string) => void
  restoreWorkspace: () => Promise<void>
  clearWorkspace: () => void
  openWorkspaceFile: (file: WorkspaceFile) => Promise<void>
  createWorkspaceFile: (relativePath: string) => Promise<void>
  createWorkspaceFolder: (relativePath: string) => Promise<void>
  openImagePreview: (file: WorkspaceFile) => Promise<void>
  closeImagePreview: () => void
  updateWorkspaceContent: (content: string) => void
  saveWorkspaceFile: (content: string) => Promise<boolean>
  runFile: () => Promise<void>
  stopRun: () => void
  appendRunOutput: (output: RunOutput) => void
  finishRun: (exit: RunExit) => void
  clearRunOutput: () => void
  /** Load a URL in the preview tab, opening the code panel and switching to it. */
  openPreview: (url: string) => void
  applyCode: (code: string, suggestedName?: string) => Promise<ApplyCodeResult>
}

function uid(): string {
  return 'sess_' + Math.random().toString(36).slice(2, 10)
}

function initialPanelSide(): PanelSide {
  try {
    return window.localStorage.getItem('gennal.panelSide') === 'left' ? 'left' : 'right'
  } catch {
    return 'right'
  }
}

function initialPanelWidth(): number {
  try {
    const raw = Number(window.localStorage.getItem('gennal.panelWidth'))
    return Number.isFinite(raw) ? Math.min(720, Math.max(280, raw)) : 360
  } catch {
    return 360
  }
}

function initialPanelOpen(): boolean {
  try {
    return window.localStorage.getItem('gennal.panelOpen') !== 'false'
  } catch {
    return true
  }
}

function initialPanelMaximized(): boolean {
  try {
    return window.localStorage.getItem('gennal.panelMaximized') === 'true'
  } catch {
    return false
  }
}

function initialSidebarOpen(): boolean {
  try {
    return window.localStorage.getItem('gennal.sidebarOpen') !== 'false'
  } catch {
    return true
  }
}

function applyTheme(theme: ThemeName): void {
  try {
    document.documentElement.dataset.theme = theme
  } catch {
    /* ignore (non-DOM env) */
  }
}

function loadTheme(): ThemeName {
  try {
    const saved = window.localStorage.getItem('gennal.theme')
    if (saved && (THEME_NAMES as string[]).includes(saved)) return saved as ThemeName
  } catch {
    /* ignore storage errors */
  }
  return 'dark'
}

const INITIAL_THEME = loadTheme()
applyTheme(INITIAL_THEME)

const WORKSPACE_STORAGE = 'gennal.workspace'

function loadSavedWorkspace(): WorkspaceOpenPathPayload | null {
  try {
    const raw = window.localStorage.getItem(WORKSPACE_STORAGE)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<WorkspaceOpenPathPayload>
    if ((parsed.kind === 'file' || parsed.kind === 'project') && typeof parsed.path === 'string' && parsed.path) {
      return {
        kind: parsed.kind,
        path: parsed.path,
        selectedFilePath:
          typeof parsed.selectedFilePath === 'string' ? parsed.selectedFilePath : undefined
      }
    }
  } catch {
    /* ignore storage errors */
  }
  return null
}

function saveWorkspaceRef(workspace: WorkspaceOpenResult): void {
  try {
    const payload: WorkspaceOpenPathPayload = {
      kind: workspace.kind,
      path: workspace.path,
      selectedFilePath: workspace.selectedFile?.path
    }
    window.localStorage.setItem(WORKSPACE_STORAGE, JSON.stringify(payload))
  } catch {
    /* ignore storage errors */
  }
}

const RECENT_PROJECTS_STORAGE = 'gennal.recentProjects'
const MAX_RECENT_PROJECTS = 12

function loadRecentProjects(): RecentProject[] {
  try {
    const raw = window.localStorage.getItem(RECENT_PROJECTS_STORAGE)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Partial<RecentProject>[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((p) => typeof p?.path === 'string' && p.path)
      .map((p) => ({ path: p.path as string, name: (p.name as string) || (p.path as string) }))
      .slice(0, MAX_RECENT_PROJECTS)
  } catch {
    return []
  }
}

function saveRecentProjects(projects: RecentProject[]): void {
  try {
    window.localStorage.setItem(RECENT_PROJECTS_STORAGE, JSON.stringify(projects.slice(0, MAX_RECENT_PROJECTS)))
  } catch {
    /* ignore storage errors */
  }
}

/** Move/insert a project to the front of the recents list (dedupe by path). */
function withProjectRemembered(projects: RecentProject[], entry: RecentProject): RecentProject[] {
  const key = entry.path.toLowerCase()
  const rest = projects.filter((p) => p.path.toLowerCase() !== key)
  return [entry, ...rest].slice(0, MAX_RECENT_PROJECTS)
}

/** Record a freshly-opened project in the recents list (privacy-gated). */
function rememberProject(
  set: (partial: Partial<AppState>) => void,
  get: () => AppState,
  workspace: WorkspaceOpenResult
): void {
  if (workspace.kind !== 'project') return
  if (!get().privacySettings.rememberWorkspace) return
  const recentProjects = withProjectRemembered(get().recentProjects, {
    path: workspace.path,
    name: workspace.name
  })
  saveRecentProjects(recentProjects)
  set({ recentProjects })
}

function clearWorkspaceRef(): void {
  try {
    window.localStorage.removeItem(WORKSPACE_STORAGE)
  } catch {
    /* ignore storage errors */
  }
}

const GITHUB_TOKEN_STORAGE = 'gennal.githubToken'

function loadGithubToken(): string {
  try {
    return window.localStorage.getItem(GITHUB_TOKEN_STORAGE) ?? ''
  } catch {
    return ''
  }
}

const AUTOMATIONS_STORAGE = 'gennal.automations'
const AUTOMATION_RUNS_STORAGE = 'gennal.automationRuns'
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

/** Next fire time (epoch ms) for a schedule, measured from `from`. */
function computeNextRun(schedule: AutomationSchedule, from: number = Date.now()): number {
  if (schedule === 'hourly') return from + HOUR_MS
  if (schedule === 'weekly') return from + 7 * DAY_MS
  let next = from + DAY_MS
  if (schedule === 'weekday') {
    const day = new Date(next).getDay()
    if (day === 6) next += 2 * DAY_MS // Saturday → Monday
    else if (day === 0) next += DAY_MS // Sunday → Monday
  }
  return next
}

function loadAutomations(): Automation[] {
  try {
    const raw = window.localStorage.getItem(AUTOMATIONS_STORAGE)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Automation[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveAutomations(automations: Automation[]): void {
  try {
    window.localStorage.setItem(AUTOMATIONS_STORAGE, JSON.stringify(automations))
  } catch {
    /* ignore storage errors */
  }
}

function loadAutomationRuns(): AutomationRun[] {
  try {
    const raw = window.localStorage.getItem(AUTOMATION_RUNS_STORAGE)
    if (!raw) return []
    const parsed = JSON.parse(raw) as AutomationRun[]
    if (!Array.isArray(parsed)) return []
    // A run still marked "running" from a previous session never finished.
    return parsed.map((r) =>
      r.status === 'running'
        ? { ...r, status: 'error', error: 'Interrupted (app closed during run).', finishedAt: r.startedAt }
        : r
    )
  } catch {
    return []
  }
}

function saveAutomationRuns(runs: AutomationRun[]): void {
  try {
    window.localStorage.setItem(AUTOMATION_RUNS_STORAGE, JSON.stringify(runs))
  } catch {
    /* ignore storage errors */
  }
}

function uidPrefixed(prefix: string): string {
  return prefix + Math.random().toString(36).slice(2, 10)
}

// Runs the scheduler triggers/manual runs both stream model output back over the
// chat IPC bridge, keyed by the run id. We bind the listeners once, lazily, the
// first time an automation actually runs.
const activeAutomationRuns = new Set<string>()
let automationListenersBound = false

function bindAutomationListeners(
  set: (fn: (s: AppState) => Partial<AppState>) => void,
  get: () => AppState
): void {
  if (automationListenersBound) return
  automationListenersBound = true
  window.api.onChatData((d) => {
    if (!activeAutomationRuns.has(d.id) || d.stream !== 'stdout') return
    set((s) => ({
      automationRuns: s.automationRuns.map((r) =>
        r.id === d.id ? { ...r, output: r.output + d.chunk } : r
      )
    }))
  })
  window.api.onChatExit((e) => {
    if (!activeAutomationRuns.has(e.id)) return
    activeAutomationRuns.delete(e.id)
    set((s) => ({
      automationRuns: s.automationRuns.map((r) =>
        r.id === e.id
          ? {
              ...r,
              status: e.error ? 'error' : 'success',
              error: e.error,
              finishedAt: new Date().toISOString()
            }
          : r
      )
    }))
    saveAutomationRuns(get().automationRuns)
  })
}

const EMPTY_PROFILE: Profile = { name: '', role: '', avatar: '' }
const GENERAL_STORAGE = 'gennal.generalSettings'
const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  restoreWorkspaceOnLaunch: true
}
const BROWSER_STORAGE = 'gennal.browserSettings'
const DEFAULT_BROWSER_SETTINGS: BrowserSettings = {
  homeUrl: 'https://www.google.com',
  openExternal: true,
  saveHistory: true,
  attachWorkspaceContext: true
}
const TERMINAL_STORAGE = 'gennal.terminalSettings'
const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  fontFamily: 'JetBrains Mono, Consolas, monospace',
  fontSize: 12.5,
  cursorBlink: true,
  scrollback: 2000,
  focusNewSessions: true,
  windowsShell: 'powershell',
  gpuAcceleration: 'auto',
  rightClickPaste: true,
  focusFollowsMouse: false,
  copyOnSelect: false,
  osc52: false,
  setupScriptLocation: 'newtab',
  scrollbackMB: 10,
  wordSeparators: " ()[]{}',\"`",
  powershellVersion: 'auto'
}
const PRIVACY_STORAGE = 'gennal.privacySettings'
// Privacy-respecting defaults: nothing leaves the device unless the user opts in.
const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  telemetry: false,
  crashReports: false,
  rememberHistory: true,
  rememberWorkspace: true,
  redactSecrets: true,
  clearOnExit: false
}
const EDITOR_STORAGE = 'gennal.editorSettings'
const CHAT_HISTORY_STORAGE = 'gennal.chatHistory'
const EDITOR_TAB_SIZES = [2, 4, 8]
const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  fontSize: 13,
  tabSize: 2,
  insertSpaces: true,
  wordWrap: false,
  lineNumbers: true,
  spellCheck: false
}

const NOTIFICATION_STORAGE = 'gennal.notificationSettings'
const NOTIFICATION_SOUNDS: NotificationSound[] = ['system', 'chime', 'ping', 'none']
const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  agentTaskComplete: true,
  terminalBell: false,
  sound: 'system',
  suppressWhileFocused: true
}

function loadProfile(): Profile {
  try {
    const raw = window.localStorage.getItem('gennal.profile')
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Profile>
      return {
        name: parsed.name?.trim() ?? '',
        role: parsed.role?.trim() ?? '',
        avatar: typeof parsed.avatar === 'string' ? parsed.avatar : ''
      }
    }
  } catch {
    /* ignore storage errors */
  }
  return EMPTY_PROFILE
}

function loadGeneralSettings(): GeneralSettings {
  try {
    const raw = window.localStorage.getItem(GENERAL_STORAGE)
    if (!raw) return DEFAULT_GENERAL_SETTINGS
    const parsed = JSON.parse(raw) as Partial<GeneralSettings>
    return {
      restoreWorkspaceOnLaunch:
        typeof parsed.restoreWorkspaceOnLaunch === 'boolean'
          ? parsed.restoreWorkspaceOnLaunch
          : DEFAULT_GENERAL_SETTINGS.restoreWorkspaceOnLaunch
    }
  } catch {
    return DEFAULT_GENERAL_SETTINGS
  }
}

function loadBrowserSettings(): BrowserSettings {
  try {
    const raw = window.localStorage.getItem(BROWSER_STORAGE)
    if (!raw) return DEFAULT_BROWSER_SETTINGS
    const parsed = JSON.parse(raw) as Partial<BrowserSettings>
    return {
      homeUrl:
        typeof parsed.homeUrl === 'string' && parsed.homeUrl.trim()
          ? parsed.homeUrl.trim()
          : DEFAULT_BROWSER_SETTINGS.homeUrl,
      openExternal:
        typeof parsed.openExternal === 'boolean'
          ? parsed.openExternal
          : DEFAULT_BROWSER_SETTINGS.openExternal,
      saveHistory:
        typeof parsed.saveHistory === 'boolean'
          ? parsed.saveHistory
          : DEFAULT_BROWSER_SETTINGS.saveHistory,
      attachWorkspaceContext:
        typeof parsed.attachWorkspaceContext === 'boolean'
          ? parsed.attachWorkspaceContext
          : DEFAULT_BROWSER_SETTINGS.attachWorkspaceContext
    }
  } catch {
    return DEFAULT_BROWSER_SETTINGS
  }
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === 'string' && (options as readonly string[]).includes(value) ? (value as T) : fallback
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function loadTerminalSettings(): TerminalSettings {
  try {
    const raw = window.localStorage.getItem(TERMINAL_STORAGE)
    if (!raw) return DEFAULT_TERMINAL_SETTINGS
    const parsed = JSON.parse(raw) as Partial<TerminalSettings>
    const fontSize = Number(parsed.fontSize)
    const scrollback = Number(parsed.scrollback)
    return {
      ...DEFAULT_TERMINAL_SETTINGS,
      fontFamily:
        typeof parsed.fontFamily === 'string' && parsed.fontFamily.trim()
          ? parsed.fontFamily
          : DEFAULT_TERMINAL_SETTINGS.fontFamily,
      fontSize: Number.isFinite(fontSize) ? Math.min(18, Math.max(10, fontSize)) : DEFAULT_TERMINAL_SETTINGS.fontSize,
      cursorBlink: typeof parsed.cursorBlink === 'boolean' ? parsed.cursorBlink : DEFAULT_TERMINAL_SETTINGS.cursorBlink,
      scrollback: [1000, 2000, 5000, 10000].includes(scrollback)
        ? scrollback
        : DEFAULT_TERMINAL_SETTINGS.scrollback,
      focusNewSessions:
        typeof parsed.focusNewSessions === 'boolean'
          ? parsed.focusNewSessions
          : DEFAULT_TERMINAL_SETTINGS.focusNewSessions,
      windowsShell: oneOf(parsed.windowsShell, ['powershell', 'cmd', 'gitbash', 'wsl'], 'powershell'),
      gpuAcceleration: oneOf(parsed.gpuAcceleration, ['auto', 'on', 'off'], 'auto'),
      rightClickPaste: bool(parsed.rightClickPaste, DEFAULT_TERMINAL_SETTINGS.rightClickPaste),
      focusFollowsMouse: bool(parsed.focusFollowsMouse, DEFAULT_TERMINAL_SETTINGS.focusFollowsMouse),
      copyOnSelect: bool(parsed.copyOnSelect, DEFAULT_TERMINAL_SETTINGS.copyOnSelect),
      osc52: bool(parsed.osc52, DEFAULT_TERMINAL_SETTINGS.osc52),
      setupScriptLocation: oneOf(parsed.setupScriptLocation, ['newtab', 'vertical', 'horizontal'], 'newtab'),
      scrollbackMB:
        typeof parsed.scrollbackMB === 'number' && parsed.scrollbackMB > 0 && parsed.scrollbackMB <= 2000
          ? parsed.scrollbackMB
          : DEFAULT_TERMINAL_SETTINGS.scrollbackMB,
      wordSeparators:
        typeof parsed.wordSeparators === 'string' && parsed.wordSeparators.length > 0
          ? parsed.wordSeparators
          : DEFAULT_TERMINAL_SETTINGS.wordSeparators,
      powershellVersion: oneOf(parsed.powershellVersion, ['auto', 'windows', 'pwsh7'], 'auto')
    }
  } catch {
    return DEFAULT_TERMINAL_SETTINGS
  }
}

function loadPrivacySettings(): PrivacySettings {
  try {
    const raw = window.localStorage.getItem(PRIVACY_STORAGE)
    if (!raw) return DEFAULT_PRIVACY_SETTINGS
    const parsed = JSON.parse(raw) as Partial<PrivacySettings>
    const pick = (key: keyof PrivacySettings): boolean =>
      typeof parsed[key] === 'boolean' ? (parsed[key] as boolean) : DEFAULT_PRIVACY_SETTINGS[key]
    return {
      telemetry: pick('telemetry'),
      crashReports: pick('crashReports'),
      rememberHistory: pick('rememberHistory'),
      rememberWorkspace: pick('rememberWorkspace'),
      redactSecrets: pick('redactSecrets'),
      clearOnExit: pick('clearOnExit')
    }
  } catch {
    return DEFAULT_PRIVACY_SETTINGS
  }
}

function loadEditorSettings(): EditorSettings {
  try {
    const raw = window.localStorage.getItem(EDITOR_STORAGE)
    if (!raw) return DEFAULT_EDITOR_SETTINGS
    const parsed = JSON.parse(raw) as Partial<EditorSettings>
    const fontSize = Number(parsed.fontSize)
    const tabSize = Number(parsed.tabSize)
    const bool = (key: keyof EditorSettings): boolean =>
      typeof parsed[key] === 'boolean' ? (parsed[key] as boolean) : (DEFAULT_EDITOR_SETTINGS[key] as boolean)
    return {
      fontSize: Number.isFinite(fontSize) ? Math.min(20, Math.max(11, fontSize)) : DEFAULT_EDITOR_SETTINGS.fontSize,
      tabSize: EDITOR_TAB_SIZES.includes(tabSize) ? tabSize : DEFAULT_EDITOR_SETTINGS.tabSize,
      insertSpaces: bool('insertSpaces'),
      wordWrap: bool('wordWrap'),
      lineNumbers: bool('lineNumbers'),
      spellCheck: bool('spellCheck')
    }
  } catch {
    return DEFAULT_EDITOR_SETTINGS
  }
}

function loadNotificationSettings(): NotificationSettings {
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_STORAGE)
    if (!raw) return DEFAULT_NOTIFICATION_SETTINGS
    const parsed = JSON.parse(raw) as Partial<NotificationSettings>
    const bool = (key: keyof NotificationSettings): boolean =>
      typeof parsed[key] === 'boolean' ? (parsed[key] as boolean) : (DEFAULT_NOTIFICATION_SETTINGS[key] as boolean)
    return {
      enabled: bool('enabled'),
      agentTaskComplete: bool('agentTaskComplete'),
      terminalBell: bool('terminalBell'),
      sound: NOTIFICATION_SOUNDS.includes(parsed.sound as NotificationSound)
        ? (parsed.sound as NotificationSound)
        : DEFAULT_NOTIFICATION_SETTINGS.sound,
      suppressWhileFocused: bool('suppressWhileFocused')
    }
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS
  }
}

function loadChatHistory(): ChatHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(CHAT_HISTORY_STORAGE)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Partial<ChatHistoryEntry>[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((entry) => typeof entry?.id === 'string' && Array.isArray(entry.messages))
      .map((entry) => ({
        id: entry.id as string,
        modelId: typeof entry.modelId === 'string' ? entry.modelId : '',
        modelLabel: typeof entry.modelLabel === 'string' ? entry.modelLabel : 'AI',
        createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString(),
        messages: (entry.messages ?? [])
          .filter((message) => message?.role === 'user' || message?.role === 'assistant')
          .map((message) => ({
            role: message.role as 'user' | 'assistant',
            text: typeof message.text === 'string' ? message.text : '',
            error: Boolean(message.error)
          }))
          .filter((message) => message.text.trim().length > 0)
      }))
      .filter((entry) => entry.messages.length > 0)
  } catch {
    return []
  }
}

function saveChatHistory(history: ChatHistoryEntry[]): void {
  try {
    window.localStorage.setItem(CHAT_HISTORY_STORAGE, JSON.stringify(history.slice(0, 50)))
  } catch {
    /* ignore storage errors */
  }
}

function clearChatHistoryStorage(): void {
  try {
    window.localStorage.removeItem(CHAT_HISTORY_STORAGE)
  } catch {
    /* ignore storage errors */
  }
}

const TERMINAL_ACCENTS = ['#22c55e', '#2f8cff', '#7c3aed', '#f97316']

function createSession(model: ModelDef, index: number, cwd?: string, projectPath?: string): Session {
  return {
    id: uid(),
    modelId: model.id,
    label: model.label,
    tag: model.tag,
    accent: TERMINAL_ACCENTS[index % TERMINAL_ACCENTS.length] ?? model.accent,
    command: model.command,
    status: 'idle',
    cwd,
    projectPath
  }
}

/** The active project's path, or `undefined` when a file / no workspace is open. */
export function activeProjectPath(workspace: WorkspaceOpenResult | null): string | undefined {
  return workspace?.kind === 'project' ? workspace.path : undefined
}

/**
 * Keep the active terminal valid for the project being shown: preserve the
 * current selection if it belongs to `projectPath`, otherwise fall back to that
 * project's first terminal (or null when it has none).
 */
function scopedActiveId(
  sessions: Session[],
  activeId: string | null,
  projectPath?: string
): string | null {
  if (sessions.some((s) => s.id === activeId && s.projectPath === projectPath)) return activeId
  return sessions.find((s) => s.projectPath === projectPath)?.id ?? null
}

export const useStore = create<AppState>((set, get) => ({
  models: [],
  sessions: [],
  activeId: null,
  rows: 2,
  cols: 2,
  mode: 'grid',
  panelSide: initialPanelSide(),
  panelWidth: initialPanelWidth(),
  panelOpen: initialPanelOpen(),
  panelMaximized: initialPanelMaximized(),
  codePanelTab: 'CODE',
  sidebarOpen: initialSidebarOpen(),
  stats: { cpu: 0, memUsedMB: 0, memTotalMB: 0 },
  paletteOpen: false,
  settingsOpen: false,
  addModelOpen: false,
  tasksOpen: false,
  automationsOpen: false,
  historyOpen: false,
  githubToken: loadGithubToken(),
  automations: loadAutomations(),
  automationRuns: loadAutomationRuns(),
  theme: INITIAL_THEME,
  profile: loadProfile(),
  generalSettings: loadGeneralSettings(),
  browserSettings: loadBrowserSettings(),
  terminalSettings: loadTerminalSettings(),
  privacySettings: loadPrivacySettings(),
  editorSettings: loadEditorSettings(),
  notificationSettings: loadNotificationSettings(),
  profileSetupOpen: loadProfile().name === '',
  workspace: null,
  workspaceError: null,
  recentProjects: loadRecentProjects(),
  imagePreview: null,
  runOutput: [],
  running: false,
  previewUrl: null,
  previewNonce: 0,
  chatHistory: loadChatHistory(),

  setModels: (models) => set({ models }),

  addModel: async (model) => {
    const existing = get().models
    const base =
      model.label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'model'
    let id = base
    let n = 2
    while (existing.some((m) => m.id === id)) id = `${base}-${n++}`

    const next: ModelDef = {
      id,
      label: model.label.trim(),
      tag: model.tag.trim() || base,
      command: model.command.trim(),
      accent: model.accent || '#A78BFA',
      custom: true
    }
    const models = [...existing, next]
    set({ models, addModelOpen: false })
    try {
      await window.api.saveModels(models)
    } catch {
      /* keep the in-memory addition even if the disk write fails */
    }
  },

  removeModel: async (id) => {
    const models = get().models.filter((m) => m.id !== id)
    set({ models })
    try {
      await window.api.saveModels(models)
    } catch {
      /* ignore disk write errors */
    }
  },

  toggleAddModel: (v) => set((s) => ({ addModelOpen: v ?? !s.addModelOpen })),

  addSession: (modelId) => {
    const model = get().models.find((m) => m.id === modelId)
    if (!model) return
    const projectPath = activeProjectPath(get().workspace)
    const session = createSession(model, get().sessions.length, projectPath, projectPath)
    set((s) => ({
      sessions: [...s.sessions, session],
      activeId: s.terminalSettings.focusNewSessions ? session.id : s.activeId
    }))
  },

  removeSession: (id) =>
    set((s) => {
      const sessions = s.sessions.filter((x) => x.id !== id)
      const activeId = s.activeId === id ? (sessions[sessions.length - 1]?.id ?? null) : s.activeId
      return { sessions, activeId }
    }),

  setStatus: (id, status) =>
    set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? { ...x, status } : x)) })),

  setActive: (id) => set({ activeId: id }),
  setGrid: (rows, cols) => set({ rows, cols }),
  setMode: (mode) => set({ mode }),
  setPanelSide: (panelSide) => {
    try {
      window.localStorage.setItem('gennal.panelSide', panelSide)
    } catch {
      /* ignore storage errors */
    }
    set({ panelSide })
  },
  setPanelWidth: (panelWidth) => {
    const next = Math.round(Math.min(720, Math.max(280, panelWidth)))
    try {
      window.localStorage.setItem('gennal.panelWidth', String(next))
    } catch {
      /* ignore storage errors */
    }
    set({ panelWidth: next })
  },
  togglePanel: (v) =>
    set((s) => {
      const panelOpen = v ?? !s.panelOpen
      const panelMaximized = panelOpen ? s.panelMaximized : false
      try {
        window.localStorage.setItem('gennal.panelOpen', String(panelOpen))
        window.localStorage.setItem('gennal.panelMaximized', String(panelMaximized))
      } catch {
        /* ignore storage errors */
      }
      return { panelOpen, panelMaximized }
    }),
  togglePanelMaximized: (v) =>
    set((s) => {
      const panelMaximized = v ?? !s.panelMaximized
      const panelOpen = panelMaximized ? true : s.panelOpen
      try {
        window.localStorage.setItem('gennal.panelMaximized', String(panelMaximized))
        window.localStorage.setItem('gennal.panelOpen', String(panelOpen))
      } catch {
        /* ignore storage errors */
      }
      return { panelMaximized, panelOpen }
    }),
  setCodePanelTab: (codePanelTab) => set({ codePanelTab }),
  toggleSidebar: (v) =>
    set((s) => {
      const sidebarOpen = v ?? !s.sidebarOpen
      try {
        window.localStorage.setItem('gennal.sidebarOpen', String(sidebarOpen))
      } catch {
        /* ignore storage errors */
      }
      return { sidebarOpen }
    }),
  setStats: (stats) => set({ stats }),
  togglePalette: (v) => set((s) => ({ paletteOpen: v ?? !s.paletteOpen })),
  toggleSettings: (v) => set((s) => ({ settingsOpen: v ?? !s.settingsOpen })),
  toggleTasks: (v) =>
    set((s) => {
      const tasksOpen = v ?? !s.tasksOpen
      return tasksOpen
        ? { tasksOpen, automationsOpen: false, historyOpen: false }
        : { tasksOpen }
    }),
  toggleAutomations: (v) =>
    set((s) => {
      const automationsOpen = v ?? !s.automationsOpen
      return automationsOpen
        ? { automationsOpen, tasksOpen: false, historyOpen: false }
        : { automationsOpen }
    }),
  toggleHistory: (v) =>
    set((s) => {
      const historyOpen = v ?? !s.historyOpen
      return historyOpen
        ? { historyOpen, tasksOpen: false, automationsOpen: false }
        : { historyOpen }
    }),
  addAutomationFromTemplate: (template) => {
    const id = uidPrefixed('auto_')
    const models = get().models
    const modelId =
      models.find((m) => m.id === 'codex')?.id ?? models.find((m) => m.id !== 'custom')?.id ?? models[0]?.id ?? 'codex'
    const automation: Automation = {
      id,
      name: template.name,
      category: template.category,
      description: template.description,
      prompt: template.prompt,
      modelId,
      schedule: template.schedule,
      enabled: true,
      createdAt: new Date().toISOString(),
      nextRunAt: computeNextRun(template.schedule)
    }
    const automations = [...get().automations, automation]
    saveAutomations(automations)
    set({ automations })
    return id
  },
  addBlankAutomation: () => {
    const id = uidPrefixed('auto_')
    const models = get().models
    const modelId =
      models.find((m) => m.id === 'codex')?.id ?? models.find((m) => m.id !== 'custom')?.id ?? models[0]?.id ?? 'codex'
    const automation: Automation = {
      id,
      name: 'New automation',
      category: 'CUSTOM',
      description: '',
      prompt: '',
      modelId,
      schedule: 'daily',
      enabled: false,
      createdAt: new Date().toISOString(),
      nextRunAt: undefined
    }
    const automations = [...get().automations, automation]
    saveAutomations(automations)
    set({ automations })
    return id
  },
  updateAutomation: (id, patch) => {
    const automations = get().automations.map((a) => {
      if (a.id !== id) return a
      const next = { ...a, ...patch }
      // Re-arm the next run when the schedule changes or it's (re-)enabled.
      if ((patch.schedule && patch.schedule !== a.schedule) || (patch.enabled && !a.enabled)) {
        next.nextRunAt = computeNextRun(next.schedule)
      }
      if (patch.enabled === false) next.nextRunAt = undefined
      return next
    })
    saveAutomations(automations)
    set({ automations })
  },
  removeAutomation: (id) => {
    const automations = get().automations.filter((a) => a.id !== id)
    const automationRuns = get().automationRuns.filter((r) => r.automationId !== id)
    saveAutomations(automations)
    saveAutomationRuns(automationRuns)
    set({ automations, automationRuns })
  },
  runAutomation: (id, trigger = 'manual') => {
    const state = get()
    const automation = state.automations.find((a) => a.id === id)
    if (!automation) return
    if (!automation.prompt.trim()) return
    const model = state.models.find((m) => m.id === automation.modelId) ?? state.models[0]
    if (!model) return

    bindAutomationListeners(set, get)
    const runId = uidPrefixed('run_')
    const run: AutomationRun = {
      id: runId,
      automationId: id,
      startedAt: new Date().toISOString(),
      status: 'running',
      trigger,
      output: ''
    }
    activeAutomationRuns.add(runId)

    const startedAt = run.startedAt
    const automations = state.automations.map((a) =>
      a.id === id
        ? { ...a, lastRunAt: startedAt, nextRunAt: a.enabled ? computeNextRun(a.schedule) : a.nextRunAt }
        : a
    )
    const automationRuns = [run, ...state.automationRuns].slice(0, 200)
    saveAutomations(automations)
    saveAutomationRuns(automationRuns)
    set({ automations, automationRuns })

    window.api.chatSend({
      id: runId,
      modelId: model.id,
      command: model.command,
      prompt: automation.prompt,
      cwd: state.workspace?.kind === 'project' ? state.workspace.path : undefined
    })
  },
  tickAutomations: () => {
    const now = Date.now()
    const runs = get().automationRuns
    const due = get().automations.filter(
      (a) =>
        a.enabled &&
        typeof a.nextRunAt === 'number' &&
        a.nextRunAt <= now &&
        !runs.some((r) => r.automationId === a.id && r.status === 'running')
    )
    for (const a of due) get().runAutomation(a.id, 'schedule')
  },
  setGithubToken: (token) => {
    const trimmed = token.trim()
    try {
      if (trimmed) window.localStorage.setItem(GITHUB_TOKEN_STORAGE, trimmed)
      else window.localStorage.removeItem(GITHUB_TOKEN_STORAGE)
    } catch {
      /* ignore storage errors */
    }
    set({ githubToken: trimmed })
  },

  setTheme: (theme) => {
    applyTheme(theme)
    try {
      window.localStorage.setItem('gennal.theme', theme)
    } catch {
      /* ignore storage errors */
    }
    set({ theme })
  },

  setProfile: (profile) => {
    const clean: Profile = {
      name: profile.name.trim(),
      role: profile.role.trim(),
      avatar: profile.avatar ?? ''
    }
    try {
      window.localStorage.setItem('gennal.profile', JSON.stringify(clean))
    } catch {
      /* ignore storage errors */
    }
    set({ profile: clean, profileSetupOpen: false })
  },

  setGeneralSettings: (settings) => {
    set((s) => {
      const next: GeneralSettings = { ...s.generalSettings, ...settings }
      try {
        window.localStorage.setItem(GENERAL_STORAGE, JSON.stringify(next))
      } catch {
        /* ignore storage errors */
      }
      return { generalSettings: next }
    })
  },

  setBrowserSettings: (settings) => {
    set((s) => {
      const next: BrowserSettings = {
        ...s.browserSettings,
        ...settings,
        homeUrl:
          typeof settings.homeUrl === 'string'
            ? settings.homeUrl.trim()
            : s.browserSettings.homeUrl
      }
      try {
        window.localStorage.setItem(BROWSER_STORAGE, JSON.stringify(next))
      } catch {
        /* ignore storage errors */
      }
      return { browserSettings: next }
    })
  },

  setTerminalSettings: (settings) => {
    set((s) => {
      const next: TerminalSettings = {
        ...s.terminalSettings,
        ...settings,
        fontSize:
          typeof settings.fontSize === 'number'
            ? Math.min(18, Math.max(10, settings.fontSize))
            : s.terminalSettings.fontSize
      }
      try {
        window.localStorage.setItem(TERMINAL_STORAGE, JSON.stringify(next))
      } catch {
        /* ignore storage errors */
      }
      return { terminalSettings: next }
    })
  },

  setPrivacySettings: (settings) => {
    set((s) => {
      const next: PrivacySettings = { ...s.privacySettings, ...settings }
      try {
        window.localStorage.setItem(PRIVACY_STORAGE, JSON.stringify(next))
        // Turning off "remember" options should also drop anything already stored.
        if (settings.rememberHistory === false) clearChatHistoryStorage()
        if (settings.rememberWorkspace === false) {
          clearWorkspaceRef()
          saveRecentProjects([])
        }
      } catch {
        /* ignore storage errors */
      }
      return {
        privacySettings: next,
        chatHistory: settings.rememberHistory === false ? [] : s.chatHistory,
        recentProjects: settings.rememberWorkspace === false ? [] : s.recentProjects
      }
    })
  },

  setEditorSettings: (settings) => {
    set((s) => {
      const next: EditorSettings = {
        ...s.editorSettings,
        ...settings,
        fontSize:
          typeof settings.fontSize === 'number'
            ? Math.min(20, Math.max(11, settings.fontSize))
            : s.editorSettings.fontSize
      }
      try {
        window.localStorage.setItem(EDITOR_STORAGE, JSON.stringify(next))
      } catch {
        /* ignore storage errors */
      }
      return { editorSettings: next }
    })
  },

  setNotificationSettings: (settings) => {
    set((s) => {
      const next: NotificationSettings = { ...s.notificationSettings, ...settings }
      try {
        window.localStorage.setItem(NOTIFICATION_STORAGE, JSON.stringify(next))
      } catch {
        /* ignore storage errors */
      }
      return { notificationSettings: next }
    })
  },

  clearLocalData: () => {
    try {
      // Wipe stored data (workspace refs, remote servers, task sources, history)
      // while keeping the user's preferences (theme, profile, settings).
      const keep = new Set([
        'gennal.theme',
        'gennal.profile',
        'gennal.generalSettings',
        'gennal.browserSettings',
        'gennal.terminalSettings',
        'gennal.privacySettings',
        'gennal.editorSettings',
        'gennal.notificationSettings',
        'gennal.panelSide',
        'gennal.panelWidth',
        'gennal.panelOpen',
        'gennal.panelMaximized',
        'gennal.sidebarOpen'
      ])
      const toRemove: string[] = []
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i)
        if (key && key.startsWith('gennal.') && !keep.has(key)) toRemove.push(key)
      }
      toRemove.forEach((key) => window.localStorage.removeItem(key))
    } catch {
      /* ignore storage errors */
    }
    set({ workspace: null, workspaceError: null, recentProjects: [], imagePreview: null, runOutput: [], chatHistory: [] })
  },

  addChatHistoryEntry: (entry) => {
    set((s) => {
      if (!s.privacySettings.rememberHistory) return s
      const next: ChatHistoryEntry[] = [
        {
          ...entry,
          id: 'chat_' + Math.random().toString(36).slice(2, 10),
          createdAt: new Date().toISOString()
        },
        ...s.chatHistory
      ].slice(0, 50)
      saveChatHistory(next)
      return { chatHistory: next }
    })
  },

  clearChatHistory: () => {
    clearChatHistoryStorage()
    set({ chatHistory: [] })
  },

  toggleProfileSetup: (v) => set((s) => ({ profileSetupOpen: v ?? !s.profileSetupOpen })),

  openWorkspace: async (kind) => {
    set({ workspaceError: null })
    try {
      const workspace = await window.api.openWorkspace(kind)
      if (workspace) {
        saveWorkspaceRef(workspace)
        rememberProject(set, get, workspace)
        set((s) => ({
          workspace,
          workspaceError: null,
          activeId: scopedActiveId(s.sessions, s.activeId, activeProjectPath(workspace))
        }))
      }
    } catch (err) {
      set({ workspaceError: err instanceof Error ? err.message : 'Unable to open workspace.' })
    }
  },

  // Reopen a project from the recents list (or anywhere we have its path).
  openProject: async (path) => {
    set({ workspaceError: null })
    try {
      const workspace = await window.api.openWorkspacePath({ kind: 'project', path })
      saveWorkspaceRef(workspace)
      rememberProject(set, get, workspace)
      set((s) => ({
        workspace,
        workspaceError: null,
        imagePreview: null,
        activeId: scopedActiveId(s.sessions, s.activeId, activeProjectPath(workspace))
      }))
    } catch (err) {
      set({ workspaceError: err instanceof Error ? err.message : 'Unable to open project.' })
    }
  },

  removeRecentProject: (path) => {
    set((s) => {
      const key = path.toLowerCase()
      const recentProjects = s.recentProjects.filter((p) => p.path.toLowerCase() !== key)
      saveRecentProjects(recentProjects)
      return { recentProjects }
    })
  },

  restoreWorkspace: async () => {
    if (!get().generalSettings.restoreWorkspaceOnLaunch) return
    if (get().workspace) return

    const saved = loadSavedWorkspace()
    if (!saved) return

    set({ workspaceError: null })
    try {
      const workspace = await window.api.openWorkspacePath(saved)
      saveWorkspaceRef(workspace)
      rememberProject(set, get, workspace)
      set((s) => ({
        workspace,
        workspaceError: null,
        activeId: scopedActiveId(s.sessions, s.activeId, activeProjectPath(workspace))
      }))
    } catch (err) {
      clearWorkspaceRef()
      set({
        workspaceError:
          err instanceof Error ? err.message : 'Saved workspace could not be restored.'
      })
    }
  },

  clearWorkspace: () => {
    clearWorkspaceRef()
    set({ workspace: null, workspaceError: null, imagePreview: null })
  },

  openWorkspaceFile: async (file) => {
    set({ workspaceError: null })
    try {
      const result = await window.api.readWorkspaceFile(file)
      set((s) => {
        if (!s.workspace) return s
        const workspace = {
          ...s.workspace,
          selectedFile: result.file,
          content: result.content,
          truncated: result.truncated
        }
        saveWorkspaceRef(workspace)
        return {
          workspace,
          workspaceError: null
        }
      })
    } catch (err) {
      set({ workspaceError: err instanceof Error ? err.message : 'Unable to read file.' })
    }
  },

  createWorkspaceFile: async (relativePath) => {
    set({ workspaceError: null })
    const workspace = get().workspace
    if (!workspace || workspace.kind !== 'project') {
      set({ workspaceError: 'Open a project before creating a file.' })
      return
    }

    try {
      const nextWorkspace = await window.api.createWorkspaceEntry({
        workspacePath: workspace.path,
        kind: 'file',
        relativePath
      })
      saveWorkspaceRef(nextWorkspace)
      set({ workspace: nextWorkspace, workspaceError: null, imagePreview: null })
    } catch (err) {
      set({ workspaceError: err instanceof Error ? err.message : 'Unable to create file.' })
    }
  },

  createWorkspaceFolder: async (relativePath) => {
    set({ workspaceError: null })
    const workspace = get().workspace
    if (!workspace || workspace.kind !== 'project') {
      set({ workspaceError: 'Open a project before creating a folder.' })
      return
    }

    try {
      const nextWorkspace = await window.api.createWorkspaceEntry({
        workspacePath: workspace.path,
        kind: 'folder',
        relativePath
      })
      saveWorkspaceRef(nextWorkspace)
      set({ workspace: nextWorkspace, workspaceError: null, imagePreview: null })
    } catch (err) {
      set({ workspaceError: err instanceof Error ? err.message : 'Unable to create folder.' })
    }
  },

  openImagePreview: async (file) => {
    set({ workspaceError: null })
    try {
      const result = await window.api.readWorkspaceImage(file)
      set({
        imagePreview: {
          name: file.name,
          relativePath: file.relativePath,
          src: result.dataUrl,
          size: result.file.size
        }
      })
    } catch (err) {
      set({ workspaceError: err instanceof Error ? err.message : 'Unable to preview image.' })
    }
  },

  closeImagePreview: () => set({ imagePreview: null }),

  updateWorkspaceContent: (content) =>
    set((s) => (s.workspace ? { workspace: { ...s.workspace, content } } : s)),

  saveWorkspaceFile: async (content) => {
    set({ workspaceError: null })
    const workspace = get().workspace
    const selectedFile = workspace?.selectedFile
    if (!workspace || !selectedFile) return false

    try {
      const result = await window.api.writeWorkspaceFile({ file: selectedFile, content })
      set({
        workspace: {
          ...workspace,
          selectedFile: result.file,
          content: result.content,
          truncated: result.truncated
        },
        workspaceError: null
      })
      return true
    } catch (err) {
      set({ workspaceError: err instanceof Error ? err.message : 'Unable to save file.' })
      return false
    }
  },

  runFile: async () => {
    const { workspace, running } = get()
    if (running) return

    const selectedFile = workspace?.selectedFile
    if (!workspace || !selectedFile) {
      set({
        runOutput: [{ stream: 'system', chunk: 'Open a file with "Upload File" to run it.\n' }],
        running: false
      })
      return
    }

    // Run what's on screen: flush the editor buffer to disk first.
    const saved = await get().saveWorkspaceFile(workspace.content ?? '')
    if (!saved) return

    // A web page has no interpreter — preview it in the in-app browser instead
    // of handing it to the console runner.
    if (isHtmlPath(selectedFile.path)) {
      get().openPreview(toFileUrl(selectedFile.path))
      return
    }

    set({ runOutput: [], running: true })
    window.api.runStart({
      filePath: selectedFile.path,
      cwd: workspace.kind === 'project' ? workspace.path : undefined
    })
  },

  stopRun: () => window.api.runStop(),

  appendRunOutput: (output) => set((s) => ({ runOutput: [...s.runOutput, output] })),

  finishRun: (exit) =>
    set((s) => {
      const detail = exit.signal ? ` (${exit.signal})` : ''
      const label = exit.code === null ? '—' : String(exit.code)
      return {
        running: false,
        runOutput: [
          ...s.runOutput,
          { stream: 'system', chunk: `\nProcess exited with code ${label}${detail}\n` }
        ]
      }
    }),

  clearRunOutput: () => set({ runOutput: [] }),

  openPreview: (url) => {
    set((s) => ({
      previewUrl: url,
      previewNonce: s.previewNonce + 1,
      codePanelTab: 'PREVIEW',
      panelOpen: true
    }))
  },

  // Apply a code block that the AI returned. With a file open in the editor we
  // overwrite it; inside a project with no file open we create `suggestedName`
  // and write into it. Anything else is a no-op with a friendly reason.
  applyCode: async (code, suggestedName) => {
    const workspace = get().workspace

    if (workspace?.selectedFile) {
      get().updateWorkspaceContent(code)
      const ok = await get().saveWorkspaceFile(code)
      return ok
        ? { ok: true, message: `Applied to ${workspace.selectedFile.relativePath}` }
        : { ok: false, message: get().workspaceError ?? 'Could not write the file.' }
    }

    if (workspace?.kind === 'project') {
      const relativePath = suggestedName?.trim()
      if (!relativePath) return { ok: false, message: 'A file name is required.' }
      try {
        const created = await window.api.createWorkspaceEntry({
          workspacePath: workspace.path,
          kind: 'file',
          relativePath
        })
        const file = created.files.find(
          (f) => f.relativePath === relativePath || f.relativePath.endsWith(relativePath)
        )
        if (!file) {
          saveWorkspaceRef(created)
          set({ workspace: created, workspaceError: null })
          return { ok: false, message: 'File created but could not be located to write into.' }
        }
        const result = await window.api.writeWorkspaceFile({ file, content: code })
        const nextWorkspace: WorkspaceOpenResult = {
          ...created,
          selectedFile: result.file,
          content: result.content,
          truncated: result.truncated
        }
        saveWorkspaceRef(nextWorkspace)
        set({ workspace: nextWorkspace, workspaceError: null })
        return { ok: true, message: `Created ${result.file.relativePath}` }
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : 'Could not create the file.' }
      }
    }

    return { ok: false, message: 'Open a file or project first, then Approve.' }
  }
}))
