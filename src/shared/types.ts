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
  git?: {
    branch: string
    remoteUrl?: string
    branchUrl?: string
  }
  selectedFile?: WorkspaceFile
  content?: string
  truncated?: boolean
}

export interface WorkspaceOpenPathPayload {
  kind: WorkspaceKind
  path: string
  selectedFilePath?: string
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

export interface WorkspaceCreateEntryPayload {
  workspacePath: string
  kind: 'file' | 'folder'
  relativePath: string
}

export interface WorkspaceImageResult {
  file: WorkspaceFile
  dataUrl: string
  mime: string
}

export type RunStream = 'stdout' | 'stderr' | 'system'

export interface RunStartPayload {
  filePath: string
  cwd?: string
}

export interface RunOutput {
  stream: RunStream
  chunk: string
}

export interface RunExit {
  code: number | null
  signal?: string
}
