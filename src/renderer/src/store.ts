import { create } from 'zustand'
import type {
  ModelDef,
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

interface AppState {
  models: ModelDef[]
  sessions: Session[]
  activeId: string | null
  rows: number
  cols: number
  mode: LayoutMode
  stats: SystemStats
  paletteOpen: boolean
  workspace: WorkspaceOpenResult | null
  workspaceError: string | null

  setModels: (m: ModelDef[]) => void
  addSession: (modelId: string) => void
  removeSession: (id: string) => void
  setStatus: (id: string, status: SessionStatus) => void
  setActive: (id: string) => void
  setGrid: (rows: number, cols: number) => void
  setMode: (mode: LayoutMode) => void
  setStats: (s: SystemStats) => void
  togglePalette: (v?: boolean) => void
  openWorkspace: (kind: WorkspaceKind) => Promise<void>
  openWorkspaceFile: (file: WorkspaceFile) => Promise<void>
  updateWorkspaceContent: (content: string) => void
  saveWorkspaceFile: (content: string) => Promise<void>
}

function uid(): string {
  return 'sess_' + Math.random().toString(36).slice(2, 10)
}

export const useStore = create<AppState>((set, get) => ({
  models: [],
  sessions: [],
  activeId: null,
  rows: 2,
  cols: 2,
  mode: 'grid',
  stats: { cpu: 0, memUsedMB: 0, memTotalMB: 0 },
  paletteOpen: false,
  workspace: null,
  workspaceError: null,

  setModels: (models) => set({ models }),

  addSession: (modelId) => {
    const model = get().models.find((m) => m.id === modelId)
    if (!model) return
    const session: Session = {
      id: uid(),
      modelId: model.id,
      label: model.label,
      tag: model.tag,
      accent: model.accent,
      command: model.command,
      status: 'idle',
      cwd: get().workspace?.kind === 'project' ? get().workspace?.path : undefined
    }
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
  setStats: (stats) => set({ stats }),
  togglePalette: (v) => set((s) => ({ paletteOpen: v ?? !s.paletteOpen })),

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
  }
}))
