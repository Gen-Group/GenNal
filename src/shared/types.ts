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

export interface AttachmentSaveResult {
  path: string
  name: string
  dataUrl: string
}

export interface UsagePeriod {
  label: string
  messages: number
  sessions: number
  toolCalls: number
  /** Noun for the primary count, e.g. "msgs", "prompts", "chats". */
  unit?: string
}

export interface CliUsageAccount {
  email?: string
  name?: string
  /** Display plan, e.g. "Max 20×", "Pro", "Plus". */
  plan?: string
  org?: string
  /** Account creation date (ISO). */
  memberSince?: string
  /** Subscription start date (ISO). */
  subscriptionSince?: string
  /** Trial end date (ISO), when on a trial. */
  trialEndsAt?: string
}

/** A usage quota window reported by the CLI (e.g. Codex's 5h / weekly limits). */
export interface CliUsageLimit {
  /** Short window name, e.g. "5h" or "Weekly". */
  label: string
  /** Percent of the window's allowance consumed (0–100). */
  usedPercent: number
  windowMinutes?: number
  /** When the window resets (ISO). */
  resetsAt?: string
}

export interface CliUsageTotals {
  sessions?: number
  messages?: number
  toolCalls?: number
  /** ISO date of the first recorded session. */
  firstSession?: string
  /** ISO date of the most recent recorded activity. */
  lastActive?: string
  /** Hour of day (0–23) with the most sessions. */
  busiestHour?: number
}

/** Per-CLI usage assembled from the tool's own local config/stats files. */
export interface CliUsage {
  modelId: string
  label: string
  /** True when any local data (account or stats) was found for this CLI. */
  available: boolean
  /** Human-readable source path, e.g. "~/.claude". */
  source?: string
  account?: CliUsageAccount
  /** Live quota windows (e.g. 5h / weekly rate limits), when the CLI reports them. */
  limits?: CliUsageLimit[]
  periods: UsagePeriod[]
  totals?: CliUsageTotals
  /** Caveat shown under the card, e.g. cache date or limited-data note. */
  note?: string
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
