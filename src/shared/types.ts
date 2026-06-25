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
  /**
   * Relative paths of every directory discovered in the project (POSIX
   * separators). Returned independently of the file list so the workspace tree
   * can show nested folders — including sibling repos in a multi-repo folder —
   * even when the file-count cap is reached deep inside one branch.
   */
  folders?: string[]
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

/** A child project/repository discovered inside a picked folder. */
export interface RepoCandidate {
  name: string
  path: string
  /** True when the folder is a git repository (has a .git entry). */
  isRepo: boolean
}

/** Result of picking/scanning a folder to decide how to import it. */
export interface FolderScanResult {
  path: string
  name: string
  /** True when the picked folder is itself a git repository. */
  isRepo: boolean
  /** Immediate child folders that look like repositories or projects. */
  repos: RepoCandidate[]
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
  cwd?: string
  /** Run a single source file by extension (interpreter chosen automatically). */
  filePath?: string
  /** …or run an explicit command (project scripts). Spawned through the shell. */
  command?: string
  args?: string[]
  /** Friendly label shown in the output header instead of the raw command. */
  label?: string
}

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

export interface ProjectScript {
  name: string
  /** The raw command the script runs, shown as a subtitle. */
  command: string
}

export interface ProjectScripts {
  manager: PackageManager
  scripts: ProjectScript[]
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

/** One terminal pane exposed to a paired mobile device. */
export interface MobilePane {
  id: string
  label: string
  tag?: string
}

/** Live desktop context the mobile bridge serves to paired phones. */
export interface MobileContext {
  /** Working directory chat/terminal commands run in (the open project). */
  cwd?: string
  /** Terminal panes currently open on the desktop. */
  panes: MobilePane[]
}

/** A phone currently connected to the mobile bridge. */
export interface MobileDevice {
  /** Stable id for the live connection (derived from address + user agent). */
  id: string
  /** Friendly name derived from the device's user agent, e.g. "iPhone". */
  name: string
  /** The device's address on the local network. */
  ip: string
  /** When the device first connected (epoch ms). */
  connectedAt: number
}

/** State of the mobile bridge server, returned to the renderer. */
export interface MobileStatus {
  running: boolean
  /** Phones currently connected to the bridge, newest first. */
  devices?: MobileDevice[]
  /** Full URL encoded in the QR code, including the pairing token. */
  url?: string
  /** Same URL without the token, for display. */
  displayUrl?: string
  host?: string
  /** All LAN addresses the server is reachable on, best guess first. Lets the
   * phone fall back to another address when the default one isn't routable. */
  addresses?: string[]
  port?: number
  /** Random pairing token; only devices that scanned the QR can connect. */
  token?: string
  /** Set when the server could not start (e.g. no LAN address, port busy). */
  error?: string
}

export type EmulatorPlatform = 'android' | 'ios'

/** A bootable mobile emulator/simulator found on this machine. */
export interface EmulatorInfo {
  /** Stable id: the AVD name (Android) or device UDID (iOS). */
  id: string
  /** Display name, e.g. "Pixel 7 API 34" or "iPhone 15 Pro". */
  name: string
  platform: EmulatorPlatform
  /** Secondary line, e.g. the iOS runtime ("iOS 17.2") or "Android Virtual Device". */
  detail?: string
  /** Current device state when known, e.g. "Booted" / "Shutdown" (iOS). */
  state?: string
  /** Shell command that boots the device, ready to run in a terminal pane. */
  launchCommand: string
}

/** Whether the toolchain for a platform is installed and where it was found. */
export interface EmulatorToolStatus {
  available: boolean
  /** Friendly guidance shown when the toolchain is missing. */
  hint?: string
  /** Resolved SDK root / tool path, when found. */
  path?: string
}

/** Emulators discovered on this machine, grouped by platform. */
export interface EmulatorList {
  android: EmulatorInfo[]
  ios: EmulatorInfo[]
  androidTool: EmulatorToolStatus
  iosTool: EmulatorToolStatus
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
  /** Estimated USD cost of the session (token usage × model pricing). */
  cost: number
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

// ---- Computer Use (AI desktop control) -------------------------------------

export type ComputerUseButton = 'left' | 'right' | 'middle'

/** A captured desktop screenshot, with the on-disk path the CLI agent reads. */
export interface ComputerUseScreenshot {
  /** Absolute path to the saved PNG (handed to the model as vision input). */
  path: string
  /** data: URL for showing the shot in the panel preview. */
  dataUrl: string
  width: number
  height: number
}

export interface ComputerUseScreen {
  width: number
  height: number
}

/** One desktop control action the renderer/agent can request. */
export type ComputerUseAction =
  | { kind: 'move'; x: number; y: number }
  | { kind: 'click'; x?: number; y?: number; button?: ComputerUseButton }
  | { kind: 'doubleclick'; x?: number; y?: number }
  | { kind: 'type'; text: string }
  | { kind: 'key'; keys: string }
  | { kind: 'scroll'; amount: number }

export interface ComputerUseResult {
  ok: boolean
  message?: string
}

/** Where the desktop-control tool lives and whether this OS supports it. */
export interface ComputerUseSetup {
  /** Absolute path to the gennal-computer wrapper the CLI agent runs. */
  toolPath: string
  /** Directory holding the tool and captured screenshots. */
  dir: string
  /** True when desktop control is supported here (Windows only for now). */
  supported: boolean
  platform: string
}

/** Facts read from disk for a project, used by the Project Settings page. */
export interface ProjectInfo {
  path: string
  /** True when the folder is a git repository. */
  isGit: boolean
  /** Current checked-out branch, when a git repo. */
  currentBranch?: string
  /** origin remote URL, when configured. */
  remoteUrl?: string
  /** "owner/name" parsed from a GitHub remote, when applicable. */
  repo?: string
  /** GitHub owner login — used for the avatar (https://github.com/<owner>.png). */
  owner?: string
  /** Primary upstream branch (e.g. "origin/main"), when derivable. */
  primaryBranch?: string
  /** All branch names: local first, then remotes (e.g. "origin/main"). */
  branches: string[]
}
