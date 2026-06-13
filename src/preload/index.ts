import { contextBridge, ipcRenderer } from 'electron'
import type {
  ModelDef,
  PtyCreatePayload,
  PtyData,
  PtyExit,
  RunExit,
  RunOutput,
  RunStartPayload,
  SystemStats,
  WorkspaceFile,
  WorkspaceKind,
  WorkspaceImageResult,
  WorkspaceOpenPathPayload,
  WorkspaceOpenResult,
  WorkspaceReadResult,
  WorkspaceWritePayload
} from '../shared/types'

const api = {
  listModels: (): Promise<ModelDef[]> => ipcRenderer.invoke('models:list'),

  openWorkspace: (kind: WorkspaceKind): Promise<WorkspaceOpenResult | null> =>
    ipcRenderer.invoke('workspace:open', kind),
  openWorkspacePath: (payload: WorkspaceOpenPathPayload): Promise<WorkspaceOpenResult> =>
    ipcRenderer.invoke('workspace:open-path', payload),
  readWorkspaceFile: (file: WorkspaceFile): Promise<WorkspaceReadResult> =>
    ipcRenderer.invoke('workspace:read-file', file),
  readWorkspaceImage: (file: WorkspaceFile): Promise<WorkspaceImageResult> =>
    ipcRenderer.invoke('workspace:read-image', file),
  writeWorkspaceFile: (payload: WorkspaceWritePayload): Promise<WorkspaceReadResult> =>
    ipcRenderer.invoke('workspace:write-file', payload),

  ptyCreate: (payload: PtyCreatePayload): void => ipcRenderer.send('pty:create', payload),
  ptyInput: (id: string, data: string): void => ipcRenderer.send('pty:input', { id, data }),
  ptyResize: (id: string, cols: number, rows: number): void =>
    ipcRenderer.send('pty:resize', { id, cols, rows }),
  ptyKill: (id: string): void => ipcRenderer.send('pty:kill', { id }),

  runStart: (payload: RunStartPayload): void => ipcRenderer.send('run:start', payload),
  runStop: (): void => ipcRenderer.send('run:stop'),
  onRunData: (cb: (o: RunOutput) => void): (() => void) => {
    const handler = (_e: unknown, o: RunOutput): void => cb(o)
    ipcRenderer.on('run:data', handler)
    return () => ipcRenderer.removeListener('run:data', handler)
  },
  onRunExit: (cb: (e: RunExit) => void): (() => void) => {
    const handler = (_e: unknown, e: RunExit): void => cb(e)
    ipcRenderer.on('run:exit', handler)
    return () => ipcRenderer.removeListener('run:exit', handler)
  },

  onPtyData: (cb: (d: PtyData) => void): (() => void) => {
    const handler = (_e: unknown, d: PtyData): void => cb(d)
    ipcRenderer.on('pty:data', handler)
    return () => ipcRenderer.removeListener('pty:data', handler)
  },
  onPtyExit: (cb: (d: PtyExit) => void): (() => void) => {
    const handler = (_e: unknown, d: PtyExit): void => cb(d)
    ipcRenderer.on('pty:exit', handler)
    return () => ipcRenderer.removeListener('pty:exit', handler)
  },
  onStats: (cb: (s: SystemStats) => void): (() => void) => {
    const handler = (_e: unknown, s: SystemStats): void => cb(s)
    ipcRenderer.on('stats:update', handler)
    return () => ipcRenderer.removeListener('stats:update', handler)
  },

  win: {
    minimize: (): void => ipcRenderer.send('win:minimize'),
    maximize: (): void => ipcRenderer.send('win:maximize'),
    close: (): void => ipcRenderer.send('win:close')
  }
}

contextBridge.exposeInMainWorld('api', api)

export type GenNalApi = typeof api
