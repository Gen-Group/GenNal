export type SessionStatus = 'idle' | 'running' | 'stopped' | 'error'

export interface ModelDef {
  id: string
  label: string
  tag: string
  command: string
  accent: string
}

export interface PtyCreatePayload {
  id: string
  cwd?: string
  command?: string
}

export interface PtyData {
  id: string
  data: string
}

export interface PtyExit {
  id: string
  code: number
}

export interface SystemStats {
  cpu: number
  memUsedMB: number
  memTotalMB: number
}

export type WorkspaceKind = 'file' | 'project'

export interface WorkspaceFile {
  path: string
  name: string
  relativePath: string
  extension: string
  size: number
}

export interface WorkspaceOpenResult {
  kind: WorkspaceKind
  path: string
  name: string
  files: WorkspaceFile[]
  selectedFile?: WorkspaceFile
  content?: string
  truncated?: boolean
}

export interface WorkspaceReadResult {
  file: WorkspaceFile
  content: string
  truncated: boolean
}

export interface WorkspaceWritePayload {
  file: WorkspaceFile
  content: string
}
