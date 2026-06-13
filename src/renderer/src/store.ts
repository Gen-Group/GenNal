import { create } from 'zustand'
import type {
  ModelDef,
  RunExit,
  RunOutput,
  SessionStatus,
  SystemStats,
  WorkspaceFile,
  WorkspaceKind,
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

interface AppState {
  models: ModelDef[]
  sessions: Session[]
  activeId: string | null
  rows: number
  cols: number
  mode: LayoutMode
  panelSide: PanelSide
  stats: SystemStats
  paletteOpen: boolean
  settingsOpen: boolean
  workspace: WorkspaceOpenResult | null
  workspaceError: string | null
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
  setStats: (s: SystemStats) => void
  togglePalette: (v?: boolean) => void
  toggleSettings: (v?: boolean) => void
  openWorkspace: (kind: WorkspaceKind) => Promise<void>
  openWorkspaceFile: (file: WorkspaceFile) => Promise<void>
  updateWorkspaceContent: (content: string) => void
  saveWorkspaceFile: (content: string) => Promise<void>
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
  stats: { cpu: 0, memUsedMB: 0, memTotalMB: 0 },
  paletteOpen: false,
  settingsOpen: false,
  workspace: null,
  workspaceError: null,
  runOutput: [],
  running: false,

  setModels: (models) =>
    set((s) => {
      if (s.sessions.length > 0) return { models }

      const shellModel = models.find((m) => m.id === 'custom') ?? models[0]
      if (!shellModel) return { models }

      const sessions = Array.from({ length: 4 }, (_, index) => createSession(shellModel, index, s.workspace?.path))
      return { models, sessions, activeId: sessions[0]?.id ?? null, rows: 2, cols: 2, mode: 'grid' }
    }),

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
  setStats: (stats) => set({ stats }),
  togglePalette: (v) => set((s) => ({ paletteOpen: v ?? !s.paletteOpen })),
  toggleSettings: (v) => set((s) => ({ settingsOpen: v ?? !s.settingsOpen })),

  openWorkspace: async (kind) => {
    set({ workspaceError: null })
    try {
      const workspace = await window.api.openWorkspace(kind)
      if (workspace) set({ workspace, workspaceError: null })
    } catch (err) {
      set({ workspaceError: err instanceof Error ? err.message : 'Unable to open workspace.' })
    }
  },

  openWorkspaceFile: async (file) => {
    set({ workspaceError: null })
    try {
      const result = await window.api.readWorkspaceFile(file)
      set((s) => {
        if (!s.workspace) return s
        return {
          workspace: {
            ...s.workspace,
            selectedFile: result.file,
            content: result.content,
            truncated: result.truncated
          },
          workspaceError: null
        }
      })
    } catch (err) {
      set({ workspaceError: err instanceof Error ? err.message : 'Unable to read file.' })
    }
  },

  updateWorkspaceContent: (content) =>
    set((s) => (s.workspace ? { workspace: { ...s.workspace, content } } : s)),

  saveWorkspaceFile: async (content) => {
    set({ workspaceError: null })
    const workspace = get().workspace
    const selectedFile = workspace?.selectedFile
    if (!workspace || !selectedFile) return

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
    } catch (err) {
      set({ workspaceError: err instanceof Error ? err.message : 'Unable to save file.' })
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
    await get().saveWorkspaceFile(workspace.content ?? '')
    if (get().workspaceError) return

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
