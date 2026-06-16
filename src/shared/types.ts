export type SessionStatus = 'idle' | 'running' | 'stopped' | 'error'

export interface ModelDef {
  id: string
  label: string
  tag: string
  command: string
  accent: string
  /** True for models the user added through the UI (vs the built-in defaults). */
  custom?: boolean
}

export interface PtyCreatePayload {
  id: string
  cwd?: string
  command?: string
  /** Plain-shell panes (Windows): 'powershell' | 'cmd' | 'gitbash' | 'wsl'. */
  shell?: string
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

export interface ChatSendPayload {
  /** Caller-generated id used to correlate the streamed reply. */
  id: string
  modelId: string
  /** The model's command, sent directly so main doesn't re-read it from disk. */
  command: string
  prompt: string
  cwd?: string
  /** Absolute paths of image files to send to the model (vision input). */
  images?: string[]
}

export interface ChatData {
  id: string
  stream: 'stdout' | 'stderr'
  chunk: string
}

export interface ChatExit {
  id: string
  code: number | null
  error?: string
}

export type GithubWorkKind = 'issue' | 'pr'

export interface GithubAssignee {
  login: string
  avatarUrl: string
}

export interface GithubWorkItem {
  id: number
  number: number
  title: string
  url: string
  state: 'open' | 'closed'
  kind: GithubWorkKind
  /** PR was merged (issues are always false). */
  merged: boolean
  /** PR is a draft. */
  draft: boolean
  assignees: GithubAssignee[]
  updatedAt: string
  repo: string
  author?: string
}

export interface GithubFetchPayload {
  /** "owner/name" derived from the workspace git remote. */
  repo: string
  /** Search qualifier string, e.g. "is:issue is:open assignee:@me". */
  query: string
  /** Personal access token; falls back to GITHUB_TOKEN/GH_TOKEN in main. */
  token?: string
}

export interface GithubWorkResult {
  items: GithubWorkItem[]
  total: number
  /** "owner/name" actually queried. */
  repo: string
  /** True when the request was authenticated with a token. */
  authenticated: boolean
}

/** Which CLI wrote a session log. */
export type AgentSessionAgent = 'codex' | 'claude'

/** One past agent CLI conversation, summarized from its on-disk log. */
export interface AgentSessionSummary {
  /** Stable id (session uuid where available, else the file path). */
  id: string
  agent: AgentSessionAgent
  /** First human prompt of the session, trimmed for display. */
  title: string
  /** Model that ran the session, e.g. "claude-opus-4-8" or "gpt-5.1-codex-max". */
  model?: string
  /** Working directory the session ran in. */
  cwd?: string
  /** Git branch recorded with the session, if any. */
  branch?: string
  /** Count of user + assistant turns. */
  messageCount: number
  /** Total tokens attributed to the session (cumulative, incl. cache). */
  tokens: number
  /** ISO timestamp of the latest activity in the session. */
  updatedAt: string
  /** Absolute path to the source log file. */
  filePath: string
}

export interface AgentSessionHistory {
  sessions: AgentSessionSummary[]
  /** Number of session files considered before the recency cap. */
  scanned: number
  /** The cap applied to the most-recent files (e.g. 500). */
  recent: number
}
