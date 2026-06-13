import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { promises as fs } from 'fs'
import { basename, extname, join, relative } from 'path'
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
  PtyCreatePayload,
  RunStartPayload,
  WorkspaceFile,
  WorkspaceKind,
  WorkspaceOpenPathPayload,
  WorkspaceImageResult,
  WorkspaceOpenResult,
  WorkspaceReadResult,
  WorkspaceWritePayload
} from '../shared/types'

let mainWindow: BrowserWindow | null = null

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
  '.cpp',
  '.cs',
  '.css',
  '.dart',
  '.env',
  '.go',
  '.gradle',
  '.html',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.php',
  '.py',
  '.rs',
  '.scss',
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
  '.cpp',
  '.cs',
  '.css',
  '.dart',
  '.go',
  '.html',
  '.java',
  '.js',
  '.jsx',
  '.php',
  '.py',
  '.rs',
  '.scss',
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

function toWorkspaceFile(path: string, root?: string, size = 0): WorkspaceFile {
  const extension = extname(path).toLowerCase()
  return {
    path,
    name: basename(path),
    relativePath: root ? relative(root, path) || basename(path) : basename(path),
    extension,
    size
  }
}

function canPreview(path: string): boolean {
  return TEXT_EXTS.has(extname(path).toLowerCase())
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

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    frame: false,
    icon: join(__dirname, '../../build/icon.ico'),
    backgroundColor: '#0a0b10',
    titleBarStyle: 'hidden',
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
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
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

  ipcMain.on('win:minimize', () => mainWindow?.minimize())
  ipcMain.on('win:maximize', () => {
    if (!mainWindow) return
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
  })
  ipcMain.on('win:close', () => mainWindow?.close())
}

app.whenReady().then(() => {
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
