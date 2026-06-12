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
import type {
  PtyCreatePayload,
  WorkspaceFile,
  WorkspaceKind,
  WorkspaceOpenResult,
  WorkspaceReadResult,
  WorkspaceWritePayload
} from '../shared/types'

let mainWindow: BrowserWindow | null = null

const PREVIEW_LIMIT = 180_000
const MAX_PROJECT_FILES = 120
const SKIP_DIRS = new Set(['.git', 'node_modules', 'out', 'dist', 'build', '.next', '.vite'])
const TEXT_EXTS = new Set([
  '.c',
  '.cpp',
  '.cs',
  '.css',
  '.go',
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
  return files
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    frame: false,
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

    const pickedPath = result.filePaths[0]
    const stat = await fs.stat(pickedPath)

    if (kind === 'file') {
      const file = toWorkspaceFile(pickedPath, undefined, stat.size)
      const preview = await readPreview(file)
      return {
        kind,
        path: pickedPath,
        name: file.name,
        files: [file],
        selectedFile: file,
        content: preview.content,
        truncated: preview.truncated
      }
    }

    const files = await listProjectFiles(pickedPath)
    const selectedFile = files.find((file) => canPreview(file.path)) ?? files[0]
    const preview = selectedFile ? await readPreview(selectedFile) : undefined
    return {
      kind,
      path: pickedPath,
      name: basename(pickedPath),
      files,
      selectedFile,
      content: preview?.content,
      truncated: preview?.truncated
    }
  })

  ipcMain.handle('workspace:read-file', async (_e, file: WorkspaceFile): Promise<WorkspaceReadResult> => {
    const stat = await fs.stat(file.path)
    return readPreview({ ...file, size: stat.size })
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
  stopStats()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  killAll()
  stopStats()
})
