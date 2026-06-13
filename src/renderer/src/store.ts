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
}

export type LayoutMode = 'grid' | 'tabs' | 'stack' | 'float'
export type PanelSide = 'left' | 'right'
export type ThemeName =
  | 'dark'
  | 'light'
  | 'midnight'
  | 'ocean'
  | 'forest'
  | 'sunset'
  | 'rose'
  | 'nord'

export const THEME_NAMES: ThemeName[] = [
  'dark',
  'light',
  'midnight',
  'ocean',
  'forest',
  'sunset',
  'rose',
  'nord'
]

export interface Profile {
  name: string
  role: string
  avatar: string
}

export interface ImagePreview {
  name: string
  relativePath: string
  src: string
  size: number
}

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
  sidebarOpen: boolean
  stats: SystemStats
  paletteOpen: boolean
  settingsOpen: boolean
  theme: ThemeName
  profile: Profile
  profileSetupOpen: boolean
  workspace: WorkspaceOpenResult | null
  workspaceError: string | null
  imagePreview: ImagePreview | null
  runOutput: RunOutput[]
  running: boolean

  setModels: (m: ModelDef[]) => void
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
  toggleSidebar: (v?: boolean) => void
  setStats: (s: SystemStats) => void
  togglePalette: (v?: boolean) => void
  toggleSettings: (v?: boolean) => void
  setTheme: (theme: ThemeName) => void
  setProfile: (profile: Profile) => void
  toggleProfileSetup: (v?: boolean) => void
  openWorkspace: (kind: WorkspaceKind) => Promise<void>
  restoreWorkspace: () => Promise<void>
  openWorkspaceFile: (file: WorkspaceFile) => Promise<void>
  openImagePreview: (file: WorkspaceFile) => Promise<void>
  closeImagePreview: () => void
  updateWorkspaceContent: (content: string) => void
  saveWorkspaceFile: (content: string) => Promise<boolean>
  runFile: () => Promise<void>
  stopRun: () => void
  appendRunOutput: (output: RunOutput) => void
  finishRun: (exit: RunExit) => void
  clearRunOutput: () => void
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

function clearWorkspaceRef(): void {
  try {
    window.localStorage.removeItem(WORKSPACE_STORAGE)
  } catch {
    /* ignore storage errors */
  }
}

const EMPTY_PROFILE: Profile = { name: '', role: '', avatar: '' }

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

const TERMINAL_ACCENTS = ['#22c55e', '#2f8cff', '#7c3aed', '#f97316']

function createSession(model: ModelDef, index: number, cwd?: string): Session {
  return {
    id: uid(),
    modelId: model.id,
    label: model.label,
    tag: model.tag,
    accent: TERMINAL_ACCENTS[index % TERMINAL_ACCENTS.length] ?? model.accent,
    command: model.command,
    status: 'idle',
    cwd
  }
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
  sidebarOpen: initialSidebarOpen(),
  stats: { cpu: 0, memUsedMB: 0, memTotalMB: 0 },
  paletteOpen: false,
  settingsOpen: false,
  theme: INITIAL_THEME,
  profile: loadProfile(),
  profileSetupOpen: loadProfile().name === '',
  workspace: null,
  workspaceError: null,
  imagePreview: null,
  runOutput: [],
  running: false,

  setModels: (models) => set({ models }),

  addSession: (modelId) => {
    const model = get().models.find((m) => m.id === modelId)
    if (!model) return
    const session = createSession(
      model,
      get().sessions.length,
      get().workspace?.kind === 'project' ? get().workspace?.path : undefined
    )
    set((s) => ({ sessions: [...s.sessions, session], activeId: session.id }))
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

  toggleProfileSetup: (v) => set((s) => ({ profileSetupOpen: v ?? !s.profileSetupOpen })),

  openWorkspace: async (kind) => {
    set({ workspaceError: null })
    try {
      const workspace = await window.api.openWorkspace(kind)
      if (workspace) {
        saveWorkspaceRef(workspace)
        set({ workspace, workspaceError: null })
      }
    } catch (err) {
      set({ workspaceError: err instanceof Error ? err.message : 'Unable to open workspace.' })
    }
  },

  restoreWorkspace: async () => {
    if (get().workspace) return

    const saved = loadSavedWorkspace()
    if (!saved) return

    set({ workspaceError: null })
    try {
      const workspace = await window.api.openWorkspacePath(saved)
      saveWorkspaceRef(workspace)
      set({ workspace, workspaceError: null })
    } catch (err) {
      clearWorkspaceRef()
      set({
        workspaceError:
          err instanceof Error ? err.message : 'Saved workspace could not be restored.'
      })
    }
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

  clearRunOutput: () => set({ runOutput: [] })
}))
