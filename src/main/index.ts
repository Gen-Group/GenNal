import { app, shell, BrowserWindow, ipcMain, dialog, protocol, clipboard, Menu } from 'electron'
import { promises as fs, type Dirent } from 'fs'
import { createHash } from 'crypto'
import { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve } from 'path'
import { loadModels, saveModels } from './model-registry'
import { readCliUsage } from './usage-reader'
import { readAgentSessionHistory } from './session-history-reader'
import {
  createSession,
  writeSession,
  resizeSession,
  killSession,
  killAll
} from './pty-manager'
import { startStats, stopStats } from './stats-service'
import { startRun, stopRun } from './run-manager'
import { startChat, cancelChat, cancelAllChats } from './chat-manager'
import { fetchGithubWork } from './github-service'
import { listEmulators } from './emulator-manager'
import {
  computerUsePerform,
  computerUseScreen,
  computerUseScreenshot,
  computerUseSetup
} from './computer-use-manager'
import {
  startMobileBridge,
  stopMobileBridge,
  mobileStatus,
  setMobileContext
} from './mobile-bridge'
import type {
  AttachmentSaveResult,
  ChatSendPayload,
  ComputerUseAction,
  FolderScanResult,
  GithubFetchPayload,
  MobileContext,
  ModelDef,
  PtyCreatePayload,
  RunStartPayload,
  WorkspaceFile,
  WorkspaceCreateEntryPayload,
  WorkspaceKind,
  WorkspaceOpenPathPayload,
  WorkspaceImageResult,
  WorkspaceOpenResult,
  WorkspaceReadResult,
  WorkspaceWritePayload,
  ProjectInfo
} from '../shared/types'

let mainWindow: BrowserWindow | null = null

// Serve the production renderer from a custom standard-origin scheme instead of
// file://. Chromium gives file:// pages an opaque origin whose localStorage is
// NOT persisted across restarts, which silently wiped the saved profile, theme,
// and all settings on every launch. A standard + secure scheme persists storage
// to disk like a normal web origin. (Dev uses an http:// origin and is fine.)
const APP_SCHEME = 'app'
const APP_ORIGIN = `${APP_SCHEME}://gennal`

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

const STATIC_MIME = new Map<string, string>([
  ['.html', 'text/html'],
  ['.js', 'text/javascript'],
  ['.mjs', 'text/javascript'],
  ['.css', 'text/css'],
  ['.json', 'application/json'],
  ['.map', 'application/json'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
  ['.txt', 'text/plain']
])

function registerAppProtocol(): void {
  const root = normalize(join(__dirname, '../renderer'))
  protocol.handle(APP_SCHEME, async (request) => {
    try {
      const { pathname } = new URL(request.url)
      const rel = !pathname || pathname === '/' ? '/index.html' : decodeURIComponent(pathname)
      const filePath = normalize(join(root, rel))
      // Never serve anything outside the bundled renderer directory.
      if (filePath !== root && !filePath.startsWith(root + (process.platform === 'win32' ? '\\' : '/'))) {
        return new Response('Forbidden', { status: 403 })
      }
      const data = await fs.readFile(filePath)
      const mime = STATIC_MIME.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream'
      return new Response(data, { headers: { 'content-type': mime } })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

const PREVIEW_LIMIT = 180_000
const MAX_PROJECT_FILES = 800
const MAX_PROJECT_DIRS = 800
const SKIP_DIRS = new Set([
  '.dart_tool',
  '.git',
  '.idea',
  '.next',
  '.vite',
  '.vscode',
  'android',
  'build',
  'coverage',
  'dist',
  'ios',
  'node_modules',
  'out'
])
const TEXT_EXTS = new Set([
  '.c',
  '.cc',
  '.cmake',
  '.cpp',
  '.cxx',
  '.cs',
  '.css',
  '.dart',
  '.env',
  '.go',
  '.gradle',
  '.h',
  '.hh',
  '.hpp',
  '.hxx',
  '.html',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.mjs',
  '.cjs',
  '.md',
  '.php',
  '.py',
  '.rs',
  '.scss',
  '.swift',
  '.ts',
  '.tsx',
  '.txt',
  '.vue',
  '.xml',
  '.yaml',
  '.yml'
])

const CODE_EXTS = new Set([
  '.c',
  '.cc',
  '.cmake',
  '.cpp',
  '.cxx',
  '.cs',
  '.css',
  '.dart',
  '.go',
  '.h',
  '.hh',
  '.hpp',
  '.hxx',
  '.html',
  '.java',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.php',
  '.py',
  '.rs',
  '.scss',
  '.swift',
  '.ts',
  '.tsx',
  '.vue'
])

const IMAGE_MIME = new Map<string, string>([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.bmp', 'image/bmp'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.avif', 'image/avif']
])
// Known binary extensions that should NOT be opened in the text editor. Anything
// not on this list is treated as previewable text (including extensionless and
// dotfiles like `.env`, `.gitignore`, `.prettierrc`, plus logs and other config).
// A NUL-byte sniff in readPreview() catches binaries with unlisted extensions.
const BINARY_EXTS = new Set([
  // images
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.avif', '.icns', '.tif', '.tiff',
  // audio / video
  '.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.flv',
  // archives
  '.zip', '.tar', '.gz', '.tgz', '.bz2', '.xz', '.7z', '.rar', '.jar', '.war',
  // fonts
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  // executables / libraries / compiled artifacts
  '.exe', '.dll', '.so', '.dylib', '.bin', '.o', '.a', '.class', '.wasm', '.node', '.pdb',
  // documents / binary data stores
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.sqlite', '.db', '.dat',
  // disk images / installable packages
  '.dmg', '.iso', '.apk', '.aab', '.ipa', '.deb', '.rpm', '.msi'
])
const IMAGE_PREVIEW_LIMIT = 25 * 1024 * 1024 // 25 MB
const ATTACHMENT_LIMIT = 25 * 1024 * 1024 // 25 MB

function toWorkspaceFile(path: string, root?: string, size = 0): WorkspaceFile {
  const name = basename(path)
  const extension = name === 'CMakeLists.txt' ? '.cmake' : extname(path).toLowerCase()
  return {
    path,
    name,
    relativePath: root ? relative(root, path) || name : name,
    extension,
    size
  }
}

function canPreview(path: string): boolean {
  return !BINARY_EXTS.has(extname(path).toLowerCase())
}

function githubBranchUrl(remoteUrl: string, branch: string): string | undefined {
  const normalized = remoteUrl
    .trim()
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/^ssh:\/\/git@github\.com\//, 'https://github.com/')
    .replace(/\.git$/, '')

  return normalized.startsWith('https://github.com/') ? `${normalized}/tree/${encodeURIComponent(branch)}` : undefined
}

async function readGitInfo(root: string): Promise<WorkspaceOpenResult['git'] | undefined> {
  try {
    const gitDir = join(root, '.git')
    const head = await fs.readFile(join(gitDir, 'HEAD'), 'utf8')
    const branch = head.startsWith('ref: refs/heads/') ? head.trim().replace('ref: refs/heads/', '') : head.trim().slice(0, 7)
    if (!branch) return undefined

    let remoteUrl: string | undefined
    try {
      const config = await fs.readFile(join(gitDir, 'config'), 'utf8')
      const originMatch = config.match(/\[remote "origin"\][\s\S]*?\n\s*url\s*=\s*(.+)/)
      remoteUrl = originMatch?.[1]?.trim()
    } catch {
      /* no remote */
    }

    return {
      branch,
      remoteUrl,
      branchUrl: remoteUrl ? githubBranchUrl(remoteUrl, branch) : undefined
    }
  } catch {
    return undefined
  }
}

/** Parse "owner/name" and owner login from a GitHub remote URL. */
function parseGithubRemote(remoteUrl?: string): { repo?: string; owner?: string } {
  if (!remoteUrl) return {}
  const normalized = remoteUrl
    .trim()
    .replace(/^git@github\.com:/, '')
    .replace(/^ssh:\/\/git@github\.com\//, '')
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/^github\.com\//, '')
    .replace(/\.git$/, '')
  const match = normalized.match(/^([^/]+)\/([^/]+)$/)
  if (!match) return {}
  return { repo: `${match[1]}/${match[2]}`, owner: match[1] }
}

/** Enumerate local and remote branch names from a repo's .git directory. */
async function listGitBranches(gitDir: string): Promise<{ local: string[]; remote: string[] }> {
  const local = new Set<string>()
  const remote = new Set<string>()

  const walk = async (base: string, prefix: string, set: Set<string>): Promise<void> => {
    let entries: Dirent[]
    try {
      entries = await fs.readdir(base, { withFileTypes: true })
    } catch {
      return // refs dir missing (e.g. nothing committed yet)
    }
    for (const entry of entries) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) await walk(join(base, entry.name), name, set)
      else set.add(name)
    }
  }

  await walk(join(gitDir, 'refs', 'heads'), '', local)
  await walk(join(gitDir, 'refs', 'remotes'), '', remote)

  // Branches packed into .git/packed-refs aren't on disk as loose files.
  try {
    const packed = await fs.readFile(join(gitDir, 'packed-refs'), 'utf8')
    for (const line of packed.split('\n')) {
      const match = line.match(/^[0-9a-f]+\s+refs\/(heads|remotes)\/(.+)$/)
      if (!match) continue
      ;(match[1] === 'heads' ? local : remote).add(match[2].trim())
    }
  } catch {
    /* no packed-refs */
  }

  remote.delete('origin/HEAD') // symbolic pointer, not a real branch
  const sort = (a: string, b: string): number => a.localeCompare(b)
  return { local: [...local].sort(sort), remote: [...remote].sort(sort) }
}

async function readProjectInfo(path: string): Promise<ProjectInfo> {
  const git = await readGitInfo(path)
  if (!git) return { path, isGit: false, branches: [] }

  const { local, remote } = await listGitBranches(join(path, '.git'))
  const { repo, owner } = parseGithubRemote(git.remoteUrl)
  const primaryBranch =
    remote.find((b) => b === 'origin/main') ??
    remote.find((b) => b === 'origin/master') ??
    remote.find((b) => b.startsWith('origin/')) ??
    (git.branch ? `origin/${git.branch}` : undefined)

  return {
    path,
    isGit: true,
    currentBranch: git.branch,
    remoteUrl: git.remoteUrl,
    repo,
    owner,
    primaryBranch,
    branches: [...local, ...remote]
  }
}

async function readPreview(file: WorkspaceFile): Promise<WorkspaceReadResult> {
  if (!canPreview(file.path)) {
    return { file, content: 'Binary or unsupported file type. Choose a source file to preview it here.', truncated: false }
  }

  const handle = await fs.open(file.path, 'r')
  try {
    const size = Math.min(file.size, PREVIEW_LIMIT)
    const buffer = Buffer.alloc(size)
    await handle.read(buffer, 0, size, 0)
    // A NUL byte in the first chunk reliably marks a binary file whose extension
    // wasn't on the binary list — show the placeholder instead of garbled bytes.
    if (buffer.includes(0)) {
      return { file, content: 'Binary or unsupported file type. Choose a source file to preview it here.', truncated: false }
    }
    return {
      file,
      content: buffer.toString('utf8'),
      truncated: file.size > PREVIEW_LIMIT
    }
  } finally {
    await handle.close()
  }
}

interface ProjectListing {
  files: WorkspaceFile[]
  folders: string[]
}

/**
 * Scan a project breadth-first so sibling folders (e.g. separate repos inside a
 * "folder with many repos") are always discovered before the file-count cap is
 * spent inside one deep branch. Directories are collected separately from files
 * so the tree can show every nested folder even when its files weren't scanned.
 */
async function listProjectFiles(root: string): Promise<ProjectListing> {
  const files: WorkspaceFile[] = []
  const folders: string[] = []
  const queue: string[] = [root]

  while (queue.length > 0) {
    const dir = queue.shift() as string
    let entries: Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      continue // unreadable directory (permissions, vanished) — skip it
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        if (folders.length < MAX_PROJECT_DIRS) {
          folders.push(relative(root, fullPath).split('\\').join('/'))
          queue.push(fullPath)
        }
        continue
      }
      if (!entry.isFile()) continue
      if (files.length >= MAX_PROJECT_FILES) continue
      const stat = await fs.stat(fullPath)
      files.push(toWorkspaceFile(fullPath, root, stat.size))
    }
  }

  files.sort((a, b) => {
    const aCode = CODE_EXTS.has(a.extension) ? 0 : 1
    const bCode = CODE_EXTS.has(b.extension) ? 0 : 1
    return aCode - bCode || a.relativePath.localeCompare(b.relativePath)
  })
  folders.sort((a, b) => a.localeCompare(b))
  return { files, folders }
}

/** Files that mark a directory as a buildable project even without a .git. */
const PROJECT_MARKERS = new Set([
  'package.json',
  'pubspec.yaml',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'Cargo.toml',
  'go.mod',
  'requirements.txt',
  'pyproject.toml',
  'composer.json',
  'Gemfile',
  'CMakeLists.txt',
  'Makefile'
])

/** True when `dir` is a git repo (`.git` may be a directory or a file). */
async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await fs.stat(join(dir, '.git'))
    return true
  } catch {
    return false
  }
}

/** True when `dir` contains a recognised project manifest. */
async function looksLikeProject(dir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dir)
    return entries.some(
      (name) => PROJECT_MARKERS.has(name) || name.endsWith('.csproj') || name.endsWith('.sln')
    )
  } catch {
    return false
  }
}

/**
 * Inspect a folder's immediate children to decide how to import it: whether the
 * folder is itself a repo, and which child folders look like separate repos or
 * projects (a "folder of many repos").
 */
async function detectRepos(root: string): Promise<FolderScanResult> {
  const result: FolderScanResult = {
    path: root,
    name: basename(root),
    isRepo: await isGitRepo(root),
    repos: []
  }

  let entries: Dirent[] = []
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return result
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
    const childPath = join(root, entry.name)
    const repo = await isGitRepo(childPath)
    if (repo || (await looksLikeProject(childPath))) {
      result.repos.push({ name: entry.name, path: childPath, isRepo: repo })
    }
  }

  result.repos.sort((a, b) => a.name.localeCompare(b.name))
  return result
}

async function openWorkspacePath(payload: WorkspaceOpenPathPayload): Promise<WorkspaceOpenResult> {
  const stat = await fs.stat(payload.path)

  if (payload.kind === 'file') {
    if (!stat.isFile()) throw new Error('Saved workspace file is no longer available.')

    const file = toWorkspaceFile(payload.path, undefined, stat.size)
    const preview = await readPreview(file)
    return {
      kind: payload.kind,
      path: payload.path,
      name: file.name,
      files: [file],
      selectedFile: file,
      content: preview.content,
      truncated: preview.truncated
    }
  }

  if (!stat.isDirectory()) throw new Error('Saved workspace folder is no longer available.')

  const { files, folders } = await listProjectFiles(payload.path)
  const git = await readGitInfo(payload.path)
  const selectedFile =
    files.find((file) => file.path === payload.selectedFilePath) ??
    files.find((file) => canPreview(file.path)) ??
    files[0]
  const preview = selectedFile ? await readPreview(selectedFile) : undefined
  return {
    kind: payload.kind,
    path: payload.path,
    name: basename(payload.path),
    files,
    folders,
    git,
    selectedFile,
    content: preview?.content,
    truncated: preview?.truncated
  }
}

function pathInside(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function resolveWorkspaceEntry(root: string, entryPath: string): string {
  const clean = entryPath.trim()
  if (!clean) throw new Error('Enter a file or folder name.')
  if (/^[a-zA-Z]:[\\/]/.test(clean) || clean.startsWith('/') || clean.startsWith('\\')) {
    throw new Error('Use a relative path inside the workspace.')
  }

  const rootPath = resolve(root)
  const target = resolve(rootPath, clean)
  if (!pathInside(rootPath, target)) throw new Error('Path must stay inside the workspace.')
  return target
}

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

// Read an image already on disk into the same shape as a saved attachment, so
// picked / dropped images get a thumbnail (dataUrl) without being copied. The
// model is later handed the original `path`.
async function readImageAttachment(path: string): Promise<AttachmentSaveResult> {
  const ext = extname(path).toLowerCase()
  const mime = IMAGE_MIME.get(ext) ?? 'application/octet-stream'
  const stat = await fs.stat(path)
  if (stat.size > ATTACHMENT_LIMIT) {
    throw new Error(`${basename(path)} is too large to attach (over 25 MB).`)
  }
  const buffer = await fs.readFile(path)
  return {
    path,
    name: basename(path),
    dataUrl: `data:${mime};base64,${buffer.toString('base64')}`
  }
}

// Group saved attachments under a per-project subfolder so the global
// attachments directory doesn't accumulate every project's images in one flat
// pile. The basename keeps the folder recognizable; a short hash of the full
// path disambiguates two projects that share a basename. Path-less calls (no
// active project) fall back to a shared bucket.
function projectAttachmentDir(projectPath?: string): string {
  const root = join(app.getPath('userData'), 'attachments')
  if (!projectPath) return join(root, '_shared')
  const slug = basename(projectPath).replace(/[^a-zA-Z0-9._-]+/g, '-') || 'project'
  const hash = createHash('sha1').update(projectPath).digest('hex').slice(0, 8)
  return join(root, `${slug}-${hash}`)
}

async function saveClipboardImage(projectPath?: string): Promise<AttachmentSaveResult | null> {
  const image = clipboard.readImage()
  if (image.isEmpty()) return null

  const png = image.toPNG()
  if (png.byteLength > ATTACHMENT_LIMIT) {
    throw new Error('Clipboard image is too large to attach (over 25 MB).')
  }

  const attachmentDir = projectAttachmentDir(projectPath)
  await fs.mkdir(attachmentDir, { recursive: true })
  const name = `clipboard-${timestampSlug()}.png`
  const path = join(attachmentDir, name)
  await fs.writeFile(path, png)

  return {
    path,
    name,
    dataUrl: `data:image/png;base64,${png.toString('base64')}`
  }
}

// Without an application menu, Electron does not register the standard
// Cut/Copy/Paste/Select-All keyboard accelerators, so Ctrl/Cmd+C can't copy
// selected UI text. Install a menu (kept hidden on the frameless Win/Linux
// windows) purely to wire those roles up.
function setupAppMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    { role: 'editMenu' },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// When the renderer handles a right-click itself (terminal "right-click to
// paste"), it asks main to skip the next native context menu so the two don't
// both fire.
let suppressContextUntil = 0

// Right-click anywhere → Copy (when text is selected) plus Cut/Paste/Select-All
// where editing makes sense.
function attachContextMenu(win: BrowserWindow): void {
  win.webContents.on('context-menu', (_e, params) => {
    if (Date.now() < suppressContextUntil) return
    const hasSelection = params.selectionText.trim().length > 0
    // Only show the native Cut/Copy/Paste menu where it makes sense: in an
    // editable field or over selected text. Otherwise stay out of the way so the
    // app's own right-click menus (e.g. the file tree's "Preview File") show
    // instead of being covered by a native popup.
    if (!params.isEditable && !hasSelection) return

    const items: Electron.MenuItemConstructorOptions[] = []
    if (params.isEditable) items.push({ role: 'cut', enabled: params.editFlags.canCut })
    items.push({ role: 'copy', enabled: hasSelection })
    if (params.isEditable) items.push({ role: 'paste', enabled: params.editFlags.canPaste })
    items.push({ type: 'separator' }, { role: 'selectAll' })
    Menu.buildFromTemplate(items).popup({ window: win })
  })
}

function createWindow(): void {
  const isMac = process.platform === 'darwin'

  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    icon: join(__dirname, '../../build/icon.ico'),
    backgroundColor: '#0a0b10',
    // macOS: keep the native window chrome — hide the title bar but show the
    // native traffic-light controls (and let them drive minimize/maximize/close).
    // Windows/Linux: fully frameless so we can draw our own window controls.
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 18, y: 18 } }
      : { frame: false }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      // Enables the in-app website preview (<webview> in the code panel).
      webviewTag: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  attachContextMenu(mainWindow)

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl)
  } else {
    mainWindow.loadURL(`${APP_ORIGIN}/index.html`)
  }

  startStats(mainWindow)
}

function registerIpc(): void {
  ipcMain.handle('models:list', () => loadModels())

  ipcMain.handle('models:save', (_e, models: ModelDef[]) => saveModels(models))

  ipcMain.handle('usage:get', (_e, modelId: string) => readCliUsage(modelId))

  ipcMain.handle('history:list', () => readAgentSessionHistory())

  ipcMain.handle('github:fetch', (_e, payload: GithubFetchPayload) => fetchGithubWork(payload))

  // Discover Android AVDs / iOS Simulators installed on this machine. Booting
  // one runs its launch command in a normal terminal pane (the emulator opens
  // its own OS window), so no extra process bookkeeping lives in main.
  ipcMain.handle('emulators:list', () => listEmulators())

  ipcMain.handle('workspace:open', async (_e, kind: WorkspaceKind): Promise<WorkspaceOpenResult | null> => {
    const options = {
      title: kind === 'project' ? 'Open project folder' : 'Open code file',
      properties: kind === 'project' ? ['openDirectory'] : ['openFile'],
      filters:
        kind === 'file'
          ? [
              { name: 'Code and text files', extensions: [...TEXT_EXTS].map((x) => x.slice(1)) },
              { name: 'All files', extensions: ['*'] }
            ]
          : undefined
    } satisfies Electron.OpenDialogOptions
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) return null

    return openWorkspacePath({ kind, path: result.filePaths[0] })
  })

  ipcMain.handle('workspace:open-path', async (_e, payload: WorkspaceOpenPathPayload): Promise<WorkspaceOpenResult> => {
    return openWorkspacePath(payload)
  })

  ipcMain.handle('project:info', (_e, path: string): Promise<ProjectInfo> => readProjectInfo(path))

  // Pick a project folder and report which child folders look like separate
  // repos/projects, so the renderer can offer "import separately vs monorepo".
  ipcMain.handle('workspace:pick-folder', async (): Promise<FolderScanResult | null> => {
    const options = {
      title: 'Open project folder',
      properties: ['openDirectory']
    } satisfies Electron.OpenDialogOptions
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) return null
    return detectRepos(result.filePaths[0])
  })

  // Scan an already-known folder path (e.g. re-importing from a recent entry).
  ipcMain.handle('workspace:scan-folder', async (_e, path: string): Promise<FolderScanResult> => {
    return detectRepos(path)
  })

  ipcMain.handle('workspace:read-file', async (_e, file: WorkspaceFile): Promise<WorkspaceReadResult> => {
    const stat = await fs.stat(file.path)
    return readPreview({ ...file, size: stat.size })
  })

  ipcMain.handle('workspace:read-image', async (_e, file: WorkspaceFile): Promise<WorkspaceImageResult> => {
    const ext = extname(file.path).toLowerCase()
    const mime = IMAGE_MIME.get(ext)
    if (!mime) throw new Error('This file type cannot be previewed as an image.')
    const stat = await fs.stat(file.path)
    if (stat.size > IMAGE_PREVIEW_LIMIT) {
      throw new Error('Image is too large to preview (over 25 MB).')
    }
    const buffer = await fs.readFile(file.path)
    return {
      file: { ...file, size: stat.size },
      dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
      mime
    }
  })

  ipcMain.handle('workspace:write-file', async (_e, payload: WorkspaceWritePayload): Promise<WorkspaceReadResult> => {
    await fs.writeFile(payload.file.path, payload.content, 'utf8')
    const stat = await fs.stat(payload.file.path)
    return readPreview({ ...payload.file, size: stat.size })
  })

  ipcMain.handle('workspace:create-entry', async (_e, payload: WorkspaceCreateEntryPayload): Promise<WorkspaceOpenResult> => {
    const rootStat = await fs.stat(payload.workspacePath)
    if (!rootStat.isDirectory()) throw new Error('Open a project folder before creating files or folders.')

    const target = resolveWorkspaceEntry(payload.workspacePath, payload.relativePath)
    if (payload.kind === 'folder') {
      await fs.mkdir(target, { recursive: true })
      return openWorkspacePath({ kind: 'project', path: payload.workspacePath })
    }

    await fs.mkdir(dirname(target), { recursive: true })
    try {
      const handle = await fs.open(target, 'wx')
      await handle.close()
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error('A file or folder already exists at that path.')
      }
      throw err
    }

    return openWorkspacePath({
      kind: 'project',
      path: payload.workspacePath,
      selectedFilePath: target
    })
  })

  ipcMain.handle(
    'attachments:save-clipboard-image',
    async (_e, projectPath?: string): Promise<AttachmentSaveResult | null> => {
      return saveClipboardImage(projectPath)
    }
  )

  ipcMain.handle('attachments:pick-images', async (): Promise<AttachmentSaveResult[]> => {
    const options = {
      title: 'Attach images',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: [...IMAGE_MIME.keys()].map((x) => x.slice(1)) }]
    } satisfies Electron.OpenDialogOptions
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return []
    return Promise.all(result.filePaths.map(readImageAttachment))
  })

  ipcMain.on('clipboard:write-text', (_e, text: string) => {
    clipboard.writeText(text)
  })

  ipcMain.handle('clipboard:read-text', () => clipboard.readText())

  ipcMain.on('terminal:suppress-context-menu', () => {
    suppressContextUntil = Date.now() + 300
  })

  ipcMain.on('pty:create', (_e, payload: PtyCreatePayload) => {
    if (mainWindow) createSession(mainWindow, payload)
  })
  ipcMain.on('pty:input', (_e, { id, data }: { id: string; data: string }) =>
    writeSession(id, data)
  )
  ipcMain.on('pty:resize', (_e, { id, cols, rows }: { id: string; cols: number; rows: number }) =>
    resizeSession(id, cols, rows)
  )
  ipcMain.on('pty:kill', (_e, { id }: { id: string }) => killSession(id))

  ipcMain.on('run:start', (_e, payload: RunStartPayload) => {
    if (mainWindow) startRun(mainWindow, payload)
  })
  ipcMain.on('run:stop', () => stopRun())

  ipcMain.on('chat:send', (event, payload: ChatSendPayload) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) {
      startChat(
        (channel, data) => {
          if (!window.isDestroyed()) window.webContents.send(channel, data)
        },
        payload
      )
    }
  })
  ipcMain.on('chat:cancel', (_e, { id }: { id: string }) => cancelChat(id))

  // GenNal Mobile: a token-secured LAN server lets a paired phone chat with the
  // models and mirror the terminals. The renderer drives start/stop and keeps the
  // bridge's view of the open project + terminal panes up to date.
  ipcMain.handle('mobile:start', () => startMobileBridge())
  ipcMain.handle('mobile:stop', () => stopMobileBridge())
  ipcMain.handle('mobile:status', () => mobileStatus())
  ipcMain.on('mobile:context', (_e, ctx: MobileContext) => setMobileContext(ctx))

  // Computer Use: capture the desktop and drive mouse/keyboard so a CLI agent
  // (or the panel) can operate the machine. Windows-only in this build.
  ipcMain.handle('computer-use:setup', () => computerUseSetup())
  ipcMain.handle('computer-use:screen', () => computerUseScreen())
  ipcMain.handle('computer-use:screenshot', () => computerUseScreenshot())
  ipcMain.handle('computer-use:perform', (_e, action: ComputerUseAction) =>
    computerUsePerform(action)
  )

  ipcMain.on('win:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize())
  ipcMain.on('win:maximize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return
    window.isMaximized() ? window.unmaximize() : window.maximize()
  })
  ipcMain.on('win:new', () => createWindow())
  ipcMain.on('win:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close())

  ipcMain.on('shell:open-external', (_e, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) void shell.openExternal(url)
  })
}

// Keep links that try to open a new window from inside the preview <webview>
// in the user's real browser rather than spawning chromeless child windows.
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() !== 'webview') return
  contents.setWindowOpenHandler((details) => {
    if (/^https?:\/\//i.test(details.url)) void shell.openExternal(details.url)
    return { action: 'deny' }
  })
})

app.whenReady().then(() => {
  registerAppProtocol()
  setupAppMenu()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  killAll()
  stopRun()
  cancelAllChats()
  stopMobileBridge()
  stopStats()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  killAll()
  stopRun()
  cancelAllChats()
  stopMobileBridge()
  stopStats()
})
