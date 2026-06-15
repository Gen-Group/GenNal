import { app, shell, BrowserWindow, ipcMain, dialog, protocol, clipboard } from 'electron'
import { promises as fs } from 'fs'
import { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve } from 'path'
import { loadModels } from './model-registry'
import {
  createSession,
  writeSession,
  resizeSession,
  killSession,
  killAll
} from './pty-manager'
import { startStats, stopStats } from './stats-service'
import { startRun, stopRun } from './run-manager'
import type {
  AttachmentSaveResult,
  PtyCreatePayload,
  RunStartPayload,
  WorkspaceFile,
  WorkspaceCreateEntryPayload,
  WorkspaceKind,
  WorkspaceOpenPathPayload,
  WorkspaceImageResult,
  WorkspaceOpenResult,
  WorkspaceReadResult,
  WorkspaceWritePayload
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
const MAX_PROJECT_FILES = 400
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
  return basename(path) === 'CMakeLists.txt' || TEXT_EXTS.has(extname(path).toLowerCase())
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

async function readPreview(file: WorkspaceFile): Promise<WorkspaceReadResult> {
  if (!canPreview(file.path)) {
    return { file, content: 'Binary or unsupported file type. Choose a source file to preview it here.', truncated: false }
  }

  const handle = await fs.open(file.path, 'r')
  try {
    const size = Math.min(file.size, PREVIEW_LIMIT)
    const buffer = Buffer.alloc(size)
    await handle.read(buffer, 0, size, 0)
    return {
      file,
      content: buffer.toString('utf8'),
      truncated: file.size > PREVIEW_LIMIT
    }
  } finally {
    await handle.close()
  }
}

async function listProjectFiles(root: string): Promise<WorkspaceFile[]> {
  const files: WorkspaceFile[] = []

  async function walk(dir: string): Promise<void> {
    if (files.length >= MAX_PROJECT_FILES) return
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (files.length >= MAX_PROJECT_FILES) return
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(fullPath)
        continue
      }
      if (!entry.isFile()) continue
      const stat = await fs.stat(fullPath)
      files.push(toWorkspaceFile(fullPath, root, stat.size))
    }
  }

  await walk(root)
  return files.sort((a, b) => {
    const aCode = CODE_EXTS.has(a.extension) ? 0 : 1
    const bCode = CODE_EXTS.has(b.extension) ? 0 : 1
    return aCode - bCode || a.relativePath.localeCompare(b.relativePath)
  })
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

  const files = await listProjectFiles(payload.path)
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

async function saveClipboardImage(): Promise<AttachmentSaveResult | null> {
  const image = clipboard.readImage()
  if (image.isEmpty()) return null

  const png = image.toPNG()
  if (png.byteLength > ATTACHMENT_LIMIT) {
    throw new Error('Clipboard image is too large to attach (over 25 MB).')
  }

  const attachmentDir = join(app.getPath('userData'), 'attachments')
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
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

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

  ipcMain.handle('attachments:save-clipboard-image', async (): Promise<AttachmentSaveResult | null> => {
    return saveClipboardImage()
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

  ipcMain.on('win:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize())
  ipcMain.on('win:maximize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return
    window.isMaximized() ? window.unmaximize() : window.maximize()
  })
  ipcMain.on('win:new', () => createWindow())
  ipcMain.on('win:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close())
}

app.whenReady().then(() => {
  registerAppProtocol()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  killAll()
  stopRun()
  stopStats()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  killAll()
  stopRun()
  stopStats()
})
