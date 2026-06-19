import { useEffect, useState, type CSSProperties } from 'react'
import { useStore, activeProjectPath } from '../store'
import type { WorkspaceFile } from '../../../shared/types'

interface FileTreeNode {
  name: string
  path: string
  folders: FileTreeNode[]
  files: WorkspaceFile[]
  fileCount: number
}

interface MutableFileTreeNode {
  name: string
  path: string
  folders: Map<string, MutableFileTreeNode>
  files: WorkspaceFile[]
  fileCount: number
}

type WorkspaceFilterId = 'all' | 'code' | 'docs' | 'images' | 'config'

const WORKSPACE_FILTERS: { id: WorkspaceFilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'code', label: 'Code' },
  { id: 'docs', label: 'Docs' },
  { id: 'images', label: 'Images' },
  { id: 'config', label: 'Config' }
]

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico', '.avif']

function fileExt(file: WorkspaceFile): string {
  return (file.extension || file.name.match(/\.[^.]+$/)?.[0] || '').toLowerCase()
}

function isImageFile(file: WorkspaceFile): boolean {
  return IMAGE_EXTS.includes(fileExt(file))
}

function fileKind(file: WorkspaceFile): string {
  const ext = fileExt(file)
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) return 'js'
  if (['.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp', '.hxx'].includes(ext)) return 'cpp'
  if (ext === '.swift') return 'swift'
  if (ext === '.cmake' || file.name === 'CMakeLists.txt') return 'cmake'
  if (ext === '.dart') return 'dart'
  if (['.css', '.scss'].includes(ext)) return 'css'
  if (['.html'].includes(ext)) return 'html'
  if (['.json', '.yaml', '.yml'].includes(ext)) return 'data'
  if (['.md', '.txt'].includes(ext)) return 'doc'
  if (IMAGE_EXTS.includes(ext)) return 'img'
  if (['.env'].includes(ext) || file.name.startsWith('.env')) return 'env'
  return 'code'
}

function FileGlyph({ file }: { file: WorkspaceFile }): JSX.Element {
  const kind = fileKind(file)
  return (
    <span className={`file-glyph kind-${kind}`} aria-hidden="true">
      {kind === 'img' ? (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2.2" y="3" width="11.6" height="10" rx="1.6" />
          <circle cx="6" cy="6.4" r="1.1" />
          <path d="M3 11.5 6.3 8.6l2 1.8 2.3-2.4 2.4 2.6" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 1.9h4.7L12 5.2v8.9H4z" />
          <path d="M8.6 2.1V5.3H12" />
        </svg>
      )}
    </span>
  )
}

function fileDisplayPath(file: WorkspaceFile): { name: string; folder: string } {
  const parts = file.relativePath.split(/[\\/]/).filter(Boolean)
  const name = parts.pop() ?? file.name
  return {
    name,
    folder: parts.length > 0 ? parts.join('/') : ''
  }
}

function fileName(file: WorkspaceFile): string {
  return fileDisplayPath(file).name
}

function matchesWorkspaceFilter(file: WorkspaceFile, filter: WorkspaceFilterId): boolean {
  if (filter === 'all') return true

  const kind = fileKind(file)
  if (filter === 'images') return kind === 'img'
  if (filter === 'docs') return kind === 'doc'
  if (filter === 'config') return kind === 'data' || kind === 'env' || kind === 'cmake'

  return ['js', 'cpp', 'swift', 'dart', 'css', 'html', 'code'].includes(kind)
}

function toFileTree(node: MutableFileTreeNode): FileTreeNode {
  return {
    name: node.name,
    path: node.path,
    files: node.files,
    fileCount: node.fileCount,
    folders: Array.from(node.folders.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(toFileTree)
  }
}

function buildFileTree(files: WorkspaceFile[]): FileTreeNode {
  const root: MutableFileTreeNode = { name: 'Root', path: 'Root', folders: new Map(), files: [], fileCount: 0 }

  for (const file of files) {
    const parts = file.relativePath.split(/[\\/]/).filter(Boolean)
    parts.pop()

    root.fileCount += 1
    let cursor = root
    let currentPath = ''

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part
      const existing = cursor.folders.get(part)
      const next =
        existing ?? { name: part, path: currentPath, folders: new Map(), files: [], fileCount: 0 }
      next.fileCount += 1
      cursor.folders.set(part, next)
      cursor = next
    }

    cursor.files.push(file)
  }

  return toFileTree(root)
}

function findFolder(node: FileTreeNode, path: string): FileTreeNode | undefined {
  if (node.path === path) return node
  for (const folder of node.folders) {
    const found = findFolder(folder, path)
    if (found) return found
  }
  return undefined
}

function firstFileInFolder(folder: FileTreeNode): WorkspaceFile | undefined {
  if (folder.files[0]) return folder.files[0]
  for (const child of folder.folders) {
    const found = firstFileInFolder(child)
    if (found) return found
  }
  return undefined
}

function workspaceInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || 'W'
}

const PROJECT_ACCENTS = ['#7c5cff', '#2f8cff', '#22c55e', '#f97316', '#ec4899', '#14b8a6', '#a78bfa', '#f59e0b']

/** Stable accent for a project's monogram, derived from its path. */
function projectAccent(path: string): string {
  let hash = 0
  for (let i = 0; i < path.length; i++) hash = (hash * 31 + path.charCodeAt(i)) | 0
  return PROJECT_ACCENTS[Math.abs(hash) % PROJECT_ACCENTS.length]
}

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '+'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function Spark({ color }: { color: string }): JSX.Element {
  // Decorative sparkline matching the screenshot's System Overview.
  const pts = '0,14 12,9 24,12 36,5 48,10 60,3 72,8 84,6 96,11'
  return (
    <svg className="spark" viewBox="0 0 96 18" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  )
}

export default function Sidebar(): JSX.Element {
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set())
  const [systemOverviewHidden, setSystemOverviewHidden] = useState<boolean>(() => {
    return window.localStorage.getItem('gennal:system-overview-hidden') === 'true'
  })
  const [filesHidden, setFilesHidden] = useState<boolean>(() => {
    return window.localStorage.getItem('gennal:files-hidden') === 'true'
  })
  const [folderMenu, setFolderMenu] = useState<{ folder: string; x: number; y: number } | null>(null)
  const [fileMenu, setFileMenu] = useState<{ file: WorkspaceFile; x: number; y: number } | null>(null)
  const [workspaceMenu, setWorkspaceMenu] = useState<{ x: number; y: number } | null>(null)
  const [filterMenu, setFilterMenu] = useState<{ x: number; y: number } | null>(null)
  const [workspaceFilter, setWorkspaceFilter] = useState<WorkspaceFilterId>('all')
  const [confirmNewWindowOpen, setConfirmNewWindowOpen] = useState(false)
  const [confirmRemoveProject, setConfirmRemoveProject] = useState<{
    path: string
    name: string
  } | null>(null)
  const [addProjectOpen, setAddProjectOpen] = useState(false)
  const [activeNav, setActiveNav] = useState<'tasks' | 'automations' | null>(null)
  const sessions = useStore((s) => s.sessions)
  const activeId = useStore((s) => s.activeId)
  const setActive = useStore((s) => s.setActive)
  const models = useStore((s) => s.models)
  const addSession = useStore((s) => s.addSession)
  const stats = useStore((s) => s.stats)
  const togglePalette = useStore((s) => s.togglePalette)
  const tasksOpen = useStore((s) => s.tasksOpen)
  const toggleTasks = useStore((s) => s.toggleTasks)
  const automationsOpen = useStore((s) => s.automationsOpen)
  const toggleAutomations = useStore((s) => s.toggleAutomations)
  const historyOpen = useStore((s) => s.historyOpen)
  const toggleHistory = useStore((s) => s.toggleHistory)
  const mobileOpen = useStore((s) => s.mobileOpen)
  const toggleMobile = useStore((s) => s.toggleMobile)
  const profile = useStore((s) => s.profile)
  const toggleProfileSetup = useStore((s) => s.toggleProfileSetup)
  const workspace = useStore((s) => s.workspace)
  const workspaceError = useStore((s) => s.workspaceError)
  const recentProjects = useStore((s) => s.recentProjects)
  const openWorkspace = useStore((s) => s.openWorkspace)
  const openProject = useStore((s) => s.openProject)
  const removeRecentProject = useStore((s) => s.removeRecentProject)
  const openWorkspaceFile = useStore((s) => s.openWorkspaceFile)
  const createWorkspaceFile = useStore((s) => s.createWorkspaceFile)
  const createWorkspaceFolder = useStore((s) => s.createWorkspaceFolder)
  const openImagePreview = useStore((s) => s.openImagePreview)
  const workspaceName = workspace?.name ?? 'Open workspace'
  // Only show terminals that belong to the active project (terminals are scoped
  // per project, matching what the main grid displays).
  const projectSessions = sessions.filter((s) => s.projectPath === activeProjectPath(workspace))
  const running = projectSessions.filter((s) => s.status === 'running').length
  const primarySessions = projectSessions.slice(0, 3)
  const aiModel = models.find((model) => model.id === 'codex') ?? models.find((model) => model.id !== 'custom')
  const cliModel = models.find((model) => model.id === 'custom') ?? models[0]
  const git = workspace?.git
  const isRepo = Boolean(git)
  const branchName = git?.branch ?? ''
  const branchUrl = git?.branchUrl
  const filteredFiles = workspace
    ? workspace.files.filter((file) => matchesWorkspaceFilter(file, workspaceFilter))
    : []
  const fileTree = workspace ? buildFileTree(filteredFiles.slice(0, 120)) : undefined
  const menuFolder = folderMenu && fileTree ? findFolder(fileTree, folderMenu.folder) : undefined
  const activeFilterLabel =
    WORKSPACE_FILTERS.find((filter) => filter.id === workspaceFilter)?.label ?? 'All'

  useEffect(() => {
    if (!folderMenu && !fileMenu && !workspaceMenu && !filterMenu) return
    const closeAll = (): void => {
      setFolderMenu(null)
      setFileMenu(null)
      setWorkspaceMenu(null)
      setFilterMenu(null)
    }
    window.addEventListener('click', closeAll)
    window.addEventListener('keydown', closeAll)
    return () => {
      window.removeEventListener('click', closeAll)
      window.removeEventListener('keydown', closeAll)
    }
  }, [folderMenu, fileMenu, workspaceMenu, filterMenu])

  useEffect(() => {
    window.localStorage.setItem('gennal:system-overview-hidden', String(systemOverviewHidden))
  }, [systemOverviewHidden])

  useEffect(() => {
    window.localStorage.setItem('gennal:files-hidden', String(filesHidden))
  }, [filesHidden])

  const toggleFolder = (folder: string): void => {
    setCollapsedFolders((current) => {
      const next = new Set(current)
      if (next.has(folder)) next.delete(folder)
      else next.add(folder)
      return next
    })
  }

  const openFolderMenu = (folder: string, x: number, y: number): void => {
    setFolderMenu({ folder, x, y })
  }

  const nestedPath = (folder: string | undefined, name: string): string => {
    const cleanName = name.trim().replace(/^[/\\]+/, '')
    if (!folder || folder === 'Root') return cleanName
    return `${folder.replace(/\\/g, '/')}/${cleanName}`
  }

  const promptNewFile = (folder?: string): void => {
    const name = window.prompt('New file path')
    if (name?.trim()) void createWorkspaceFile(nestedPath(folder, name))
  }

  const promptNewFolder = (folder?: string): void => {
    const name = window.prompt('New folder path')
    if (name?.trim()) void createWorkspaceFolder(nestedPath(folder, name))
  }

  const pickWorkspace = (kind: 'file' | 'project'): void => {
    setAddProjectOpen(false)
    void openWorkspace(kind)
  }

  const requestNewWindow = (): void => {
    setWorkspaceMenu(null)
    setConfirmNewWindowOpen(true)
  }

  const confirmNewWindow = (): void => {
    window.api.win.newWindow()
    setConfirmNewWindowOpen(false)
  }

  const openBranch = (): void => {
    if (branchUrl) {
      window.open(branchUrl, '_blank', 'noopener,noreferrer')
    } else {
      void openWorkspace('project')
    }
  }

  const renderFile = (file: WorkspaceFile): JSX.Element => (
    <button
      key={file.path}
      className={`file-item ${workspace?.selectedFile?.path === file.path ? 'active' : ''}`}
      title={`${file.relativePath} - right-click to preview`}
      onClick={() => (isImageFile(file) ? void openImagePreview(file) : void openWorkspaceFile(file))}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setFileMenu({ file, x: event.clientX, y: event.clientY })
      }}
    >
      <FileGlyph file={file} />
      <span className="file-copy">
        <span className="file-name">{fileName(file)}</span>
      </span>
    </button>
  )

  const renderFolder = (folder: FileTreeNode, depth = 0): JSX.Element => (
    <div className="file-group" key={folder.path} style={{ '--tree-depth': depth } as CSSProperties}>
      <div
        className="file-group-row"
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          openFolderMenu(folder.path, event.clientX, event.clientY)
        }}
      >
        <button className="file-group-head" title={folder.path} onClick={() => toggleFolder(folder.path)}>
          <span className={`folder-chevron ${collapsedFolders.has(folder.path) ? 'collapsed' : ''}`} aria-hidden="true">
            <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 4l4 4-4 4" />
            </svg>
          </span>
          <span className="folder-glyph" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" stroke="none">
              {collapsedFolders.has(folder.path) ? (
                <path d="M2 4.4c0-.77.63-1.4 1.4-1.4h2.7c.46 0 .9.23 1.16.62l.5.78H12.6c.77 0 1.4.63 1.4 1.4v5.4c0 .77-.63 1.4-1.4 1.4H3.4C2.63 13 2 12.37 2 11.6z" />
              ) : (
                <path d="M2 4.4c0-.77.63-1.4 1.4-1.4h2.7c.46 0 .9.23 1.16.62l.5.78H12.6c.77 0 1.4.63 1.4 1.4v.6H2zM2 7h12.4l-1.1 4.9c-.13.6-.66 1.1-1.32 1.1H3.4c-.66 0-1.2-.46-1.36-1.1z" />
              )}
            </svg>
          </span>
          <span className="folder-name">{folder.name}</span>
          <span className="file-count">{folder.fileCount}</span>
        </button>
        <button
          className="folder-more"
          title="Folder actions"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            const rect = event.currentTarget.getBoundingClientRect()
            openFolderMenu(folder.path, rect.right - 156, rect.bottom + 4)
          }}
        >
          <span className="more-icon" />
        </button>
      </div>
      {!collapsedFolders.has(folder.path) && (
        <div className="file-children">
          {folder.files.map(renderFile)}
          {folder.folders.map((child) => renderFolder(child, depth + 1))}
        </div>
      )}
    </div>
  )

  return (
    <aside className="sidebar">
      <nav className="side-nav" aria-label="Primary">
        <button
          className={`side-nav-item ${tasksOpen ? 'active' : ''}`}
          title="Tasks"
          onClick={() => {
            setActiveNav('tasks')
            toggleTasks(true)
          }}
        >
          <span className="nav-ico" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 4.5h7M6 8h7M6 11.5h7" />
              <path d="M2.6 4.5h.01M2.6 8h.01M2.6 11.5h.01" />
            </svg>
          </span>
          <span className="nav-label">Tasks</span>
        </button>
        <button
          className={`side-nav-item ${automationsOpen ? 'active' : ''}`}
          title="Automations"
          onClick={() => {
            setActiveNav('automations')
            toggleAutomations(true)
          }}
        >
          <span className="nav-ico" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="9" r="5" />
              <path d="M8 6.6V9l1.7 1" />
              <path d="M5.6 2.5 4 4M10.4 2.5 12 4" />
            </svg>
          </span>
          <span className="nav-label">Automations</span>
        </button>
        <button
          className={`side-nav-item ${historyOpen ? 'active' : ''}`}
          title="Agent Session History"
          onClick={() => {
            setActiveNav(null)
            toggleHistory(true)
          }}
        >
          <span className="nav-ico" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3.5A5 5 0 1 1 3.2 7" />
              <path d="M3 3.5V7h3.4" />
              <path d="M8 5.6V8l1.8 1" />
            </svg>
          </span>
          <span className="nav-label">History</span>
        </button>
        <button
          className={`side-nav-item ${mobileOpen ? 'active' : ''}`}
          title="GenNal Mobile — pair your phone"
          onClick={() => toggleMobile(true)}
        >
          <span className="nav-ico" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4.5" y="2" width="7" height="12" rx="1.6" />
              <path d="M7 12h2" />
            </svg>
          </span>
          <span className="nav-label">GenNal Mobile</span>
        </button>
        <button className="side-nav-item" title="Search (Ctrl K)" onClick={() => togglePalette(true)}>
          <span className="nav-ico" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="7" cy="7" r="4.2" />
              <path d="M10.2 10.2 14 14" />
            </svg>
          </span>
          <span className="nav-label">Search</span>
        </button>
      </nav>

      <section className="side-sec projects-sec">
        <div className="projects-top">
          <span>Projects</span>
          <button
            className="projects-add"
            title="Open another project"
            aria-label="Open another project"
            onClick={() => setAddProjectOpen(true)}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M8 3v10M3 8h10" />
            </svg>
          </button>
        </div>
        <div className="projects-list">
          {recentProjects.length === 0 ? (
            <button className="projects-empty" onClick={() => setAddProjectOpen(true)}>
              Open a project to get started
            </button>
          ) : (
            recentProjects.map((project) => {
              const active =
                workspace?.kind === 'project' &&
                workspace.path.toLowerCase() === project.path.toLowerCase()
              return (
                <div className={`project-row ${active ? 'active' : ''}`} key={project.path}>
                  <button
                    className="project-open"
                    title={project.path}
                    onClick={() => void openProject(project.path)}
                  >
                    <span className="project-mono" style={{ background: projectAccent(project.path) }}>
                      {workspaceInitial(project.name)}
                    </span>
                    <span className="project-row-name">{project.name}</span>
                  </button>
                  <button
                    className="project-remove"
                    title="Remove from list"
                    aria-label={`Remove ${project.name} from the list`}
                    onClick={(event) => {
                      event.stopPropagation()
                      setConfirmRemoveProject({ path: project.path, name: project.name })
                    }}
                  >
                    <svg viewBox="0 0 14 14" width="12" height="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                      <path d="M3.5 3.5 L10.5 10.5 M10.5 3.5 L3.5 10.5" />
                    </svg>
                  </button>
                </div>
              )
            })
          )}
        </div>
        <div className="projects-foot">
          <button
            className="projects-refresh"
            title="Reload the current project"
            aria-label="Reload the current project"
            disabled={workspace?.kind !== 'project'}
            onClick={() => workspace?.kind === 'project' && void openProject(workspace.path)}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M13 3v3h-3" />
              <path d="M13 6A5.5 5.5 0 1 0 13.5 9" />
            </svg>
          </button>
        </div>
      </section>

      <section className="side-sec">
        <div className="workspace-top">
          <span>Workspaces</span>
          <div className="workspace-tools">
            <button
              className={`workspace-tool ${filesHidden ? 'active' : ''}`}
              title={filesHidden ? 'Show files' : 'Hide files'}
              aria-label={filesHidden ? 'Show files' : 'Hide files'}
              aria-pressed={filesHidden}
              onClick={() => setFilesHidden((hidden) => !hidden)}
            >
              {filesHidden ? (
                <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4z" />
                  <circle cx="8" cy="8" r="1.8" />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 8s2.2-4 6-4c1.2 0 2.2.4 3.1 1" />
                  <path d="M14 8s-.8 1.5-2.2 2.6M9.8 11.7A6.8 6.8 0 0 1 8 12c-3.8 0-6-4-6-4s.7-1.3 2-2.4" />
                  <path d="M3 3l10 10" />
                </svg>
              )}
            </button>
            <button
              className={`workspace-tool ${filterMenu ? 'active' : ''}`}
              title="Workspace filters"
              aria-label="Workspace filters"
              aria-expanded={Boolean(filterMenu)}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                const rect = event.currentTarget.getBoundingClientRect()
                setFilterMenu({ x: rect.right - 148, y: rect.bottom + 6 })
              }}
            >
              <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
                <path d="M2 4h7M12 4h2M2 8h2M7 8h7M2 12h9M14 12h0" />
                <circle cx="10.5" cy="4" r="1.6" fill="var(--panel,#0c0e16)" />
                <circle cx="5.5" cy="8" r="1.6" fill="var(--panel,#0c0e16)" />
                <circle cx="12.5" cy="12" r="1.6" fill="var(--panel,#0c0e16)" />
              </svg>
            </button>
            <button className="workspace-tool" title="Upload file" aria-label="Upload file" onClick={() => void openWorkspace('file')}>
              <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 2H4.5A1.5 1.5 0 0 0 3 3.5v9A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V6z" />
                <path d="M9 2v4h4" />
                <path d="M8 11.5v-3M6.5 10h3" />
              </svg>
            </button>
            <button
              className={`workspace-tool ${workspaceMenu ? 'active' : ''}`}
              title="Add workspace item"
              aria-label="Add workspace item"
              aria-expanded={Boolean(workspaceMenu)}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                const rect = event.currentTarget.getBoundingClientRect()
                setWorkspaceMenu({ x: rect.right - 168, y: rect.bottom + 6 })
              }}
            >
              <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <path d="M8 3v10M3 8h10" />
              </svg>
            </button>
          </div>
        </div>
        {filterMenu && (
          <div
            className="workspace-filter-menu"
            style={{ left: filterMenu.x, top: filterMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            {WORKSPACE_FILTERS.map((filter) => (
              <button
                key={filter.id}
                className={workspaceFilter === filter.id ? 'active' : ''}
                onClick={() => {
                  setWorkspaceFilter(filter.id)
                  setFilterMenu(null)
                }}
              >
                <span>{filter.label}</span>
                <span>{workspace?.files.filter((file) => matchesWorkspaceFilter(file, filter.id)).length ?? 0}</span>
              </button>
            ))}
          </div>
        )}
        {!filesHidden && (
          <div className="workspace-filter">
            <span className="list-icon" />
            <span>{activeFilterLabel}</span>
            <span className="workspace-filter-count">{filteredFiles.length}</span>
          </div>
        )}
        <div className={`workspace-stack ${workspace ? 'active' : ''}`}>
          {isRepo ? (
            <button
              className={`workspace-branch ${branchUrl ? 'linked' : ''}`}
              title={git?.remoteUrl ?? `Current branch: ${branchName}`}
              onClick={openBranch}
            >
              <span className={`branch-status ${running > 0 ? 'on' : ''}`} aria-hidden="true" />
              <span className="branch-name">{branchName}</span>
              <span className="branch-pill primary">primary</span>
            </button>
          ) : (
            <div
              className="workspace-branch no-repo"
              title={workspace ? 'This folder is not a git repository' : 'Open a project to see its branch'}
            >
              <span className="branch-dot off" />
              <span className="branch-name">{workspace ? 'No repository' : 'No project open'}</span>
            </div>
          )}
          <button className="workspace-project" onClick={() => setAddProjectOpen(true)}>
            <span className="project-indent" />
            <span className="project-icon">{workspaceInitial(workspaceName)}</span>
            <span className="project-name">{workspaceName}</span>
            <span className="project-meta">{isRepo ? branchName : workspace ? 'no repo' : 'project'}</span>
          </button>
          <div className="workspace-models">
            {aiModel && (
              <button
                className="workspace-action-chip ai"
                title={`Start ${aiModel.label}`}
                onClick={() => addSession(aiModel.id)}
              >
                AI
              </button>
            )}
            {cliModel && (
              <button
                className="workspace-action-chip cli"
                title={`Start ${cliModel.label}`}
                onClick={() => addSession(cliModel.id)}
              >
                CLI
              </button>
            )}
            {primarySessions.map((session) => (
              <button
                key={session.id}
                className={`workspace-model ${activeId === session.id ? 'active' : ''}`}
                title={session.label}
                onClick={() => setActive(session.id)}
              >
                <span className="model-status" style={{ background: session.accent }} />
                <span>{session.label.slice(0, 1)}</span>
              </button>
            ))}
            {primarySessions.length === 0 && (
              <span className="workspace-model-empty">No sessions</span>
            )}
            <span className="workspace-open-arrow">›</span>
          </div>
        </div>
        {workspaceMenu && (
          <div
            className="workspace-add-menu"
            style={{ left: workspaceMenu.x, top: workspaceMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              onClick={() => {
                promptNewFile()
                setWorkspaceMenu(null)
              }}
            >
              New File
            </button>
            <button
              onClick={() => {
                promptNewFolder()
                setWorkspaceMenu(null)
              }}
            >
              New Folder
            </button>
            <button
              onClick={() => {
                void openWorkspace('file')
                setWorkspaceMenu(null)
              }}
            >
              Upload File
            </button>
            <button
              onClick={() => {
                setAddProjectOpen(true)
                setWorkspaceMenu(null)
              }}
            >
              Add Project...
            </button>
            <button
              onClick={() => {
                requestNewWindow()
              }}
            >
              New Window
            </button>
          </div>
        )}
        {workspaceError && !filesHidden && <div className="side-error">{workspaceError}</div>}
        {filesHidden ? (
          <button className="ov-hidden-row files-hidden-row" onClick={() => setFilesHidden(false)}>
            <span>Files hidden</span>
            <span>Show</span>
          </button>
        ) : (
          workspace && (
            <div className="file-list">
              {fileTree?.files.map(renderFile)}
              {fileTree?.folders.map((folder) => renderFolder(folder))}
              {filteredFiles.length === 0 && (
                <div className="file-more">No files match this filter</div>
              )}
              {filteredFiles.length > 120 && (
                <div className="file-more file-more-count">
                  <span className="file-more-dots" aria-hidden="true" />
                  +{filteredFiles.length - 120} more files
                </div>
              )}
            </div>
          )
        )}
        {fileMenu && (
          <div
            className="file-menu"
            style={{ left: fileMenu.x, top: fileMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              onClick={() => {
                if (isImageFile(fileMenu.file)) void openImagePreview(fileMenu.file)
                else void openWorkspaceFile(fileMenu.file)
                setFileMenu(null)
              }}
            >
              Preview File
            </button>
          </div>
        )}
        {folderMenu && menuFolder && (
          <div
            className="folder-menu"
            style={{ left: folderMenu.x, top: folderMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              onClick={() => {
                promptNewFile(menuFolder.path)
                setFolderMenu(null)
              }}
            >
              New file
            </button>
            <button
              onClick={() => {
                promptNewFolder(menuFolder.path)
                setFolderMenu(null)
              }}
            >
              New folder
            </button>
            <button
              onClick={() => {
                const firstFile = firstFileInFolder(menuFolder)
                if (firstFile) void openWorkspaceFile(firstFile)
                setFolderMenu(null)
              }}
            >
              Preview first file
            </button>
            <button
              onClick={() => {
                toggleFolder(menuFolder.path)
                setFolderMenu(null)
              }}
            >
              {collapsedFolders.has(menuFolder.path) ? 'Expand folder' : 'Collapse folder'}
            </button>
          </div>
        )}
      </section>

      <section className={`side-sec system-overview ${systemOverviewHidden ? 'hidden' : ''}`}>
        <div className="side-head">
          <span>SYSTEM OVERVIEW</span>
          <button
            className="side-head-action"
            title={systemOverviewHidden ? 'Show system overview' : 'Hide system overview'}
            aria-label={systemOverviewHidden ? 'Show system overview' : 'Hide system overview'}
            aria-pressed={systemOverviewHidden}
            onClick={() => setSystemOverviewHidden((hidden) => !hidden)}
          >
            {systemOverviewHidden ? (
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4z" />
                <circle cx="8" cy="8" r="1.8" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 8s2.2-4 6-4c1.2 0 2.2.4 3.1 1" />
                <path d="M14 8s-.8 1.5-2.2 2.6M9.8 11.7A6.8 6.8 0 0 1 8 12c-3.8 0-6-4-6-4s.7-1.3 2-2.4" />
                <path d="M3 3l10 10" />
              </svg>
            )}
          </button>
        </div>
        {systemOverviewHidden ? (
          <button className="ov-hidden-row" onClick={() => setSystemOverviewHidden(false)}>
            <span>Overview hidden</span>
            <span>Show</span>
          </button>
        ) : (
          <>
            <div className="ov-row">
              <div>
                <div className="ov-big">{running} Active</div>
                <div className="ov-sub">Models</div>
              </div>
              <Spark color="#22c55e" />
            </div>
            <div className="ov-row">
              <div>
                <div className="ov-big">{(stats.memUsedMB / 1024).toFixed(1)} GB</div>
                <div className="ov-sub">Memory</div>
              </div>
              <Spark color="#4285f4" />
            </div>
            <div className="ov-row">
              <div>
                <div className="ov-big">{stats.cpu}%</div>
                <div className="ov-sub">CPU</div>
              </div>
              <Spark color="#7c5cff" />
            </div>
          </>
        )}
      </section>

      {addProjectOpen && (
        <div className="add-project-backdrop" onMouseDown={() => setAddProjectOpen(false)}>
          <div
            className="add-project-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-project-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="add-project-head">
              <h2 id="add-project-title">Add a project</h2>
              <button
                className="add-project-close"
                title="Close"
                aria-label="Close add project"
                onClick={() => setAddProjectOpen(false)}
              >
                <svg viewBox="0 0 14 14" width="14" height="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M3.5 3.5 L10.5 10.5 M10.5 3.5 L3.5 10.5" />
                </svg>
              </button>
            </div>

            <div className="add-project-actions">
              <button className="add-project-option primary" onClick={() => pickWorkspace('project')}>
                <span className="add-project-icon" aria-hidden="true">
                  <svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.5 5.5a2 2 0 0 1 2-2h3l1.5 1.8h4.5a2 2 0 0 1 2 2v5.2a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2z" />
                  </svg>
                </span>
                <span className="add-project-copy">
                  <strong>Browse folder</strong>
                  <span>Local project, Git repo, or folder with many repos</span>
                </span>
              </button>

              <div className="add-project-label">Other ways to add</div>

              <button className="add-project-option" onClick={() => pickWorkspace('file')}>
                <span className="add-project-icon" aria-hidden="true">
                  <svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 2.5H5a1.5 1.5 0 0 0-1.5 1.5v10A1.5 1.5 0 0 0 5 15.5h8a1.5 1.5 0 0 0 1.5-1.5V7z" />
                    <path d="M10 2.5V7h4.5" />
                    <path d="M9 12V8.5M7.5 10l1.5-1.5 1.5 1.5" />
                  </svg>
                </span>
                <span className="add-project-copy">
                  <strong>Upload file</strong>
                  <span>Open a single code or text file as the workspace</span>
                </span>
              </button>

              <button
                className="add-project-option"
                onClick={() => {
                  setAddProjectOpen(false)
                  promptNewFolder()
                }}
              >
                <span className="add-project-icon" aria-hidden="true">
                  <svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M9 4v10M4 9h10" />
                  </svg>
                </span>
                <span className="add-project-copy">
                  <strong>Create new project</strong>
                  <span>Start from an empty folder in the current project</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmNewWindowOpen && (
        <div className="confirm-popover-backdrop" onMouseDown={() => setConfirmNewWindowOpen(false)}>
          <div
            className="confirm-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-window-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="confirm-hide"
              title="Hide"
              aria-label="Hide new window prompt"
              onClick={() => setConfirmNewWindowOpen(false)}
            >
              <svg viewBox="0 0 14 14" width="13" height="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <path d="M3.5 3.5 L10.5 10.5 M10.5 3.5 L3.5 10.5" />
              </svg>
            </button>
            <div className="confirm-icon" aria-hidden="true">
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="10" height="10" rx="1.5" />
                <path d="M8 5.5v5M5.5 8h5" />
              </svg>
            </div>
            <div className="confirm-copy">
              <h3 id="new-window-title">Create new window?</h3>
              <p>This opens another GenNal workspace window.</p>
            </div>
            <div className="confirm-actions">
              <button className="confirm-secondary" onClick={() => setConfirmNewWindowOpen(false)}>
                Hide
              </button>
              <button className="confirm-primary" onClick={confirmNewWindow}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmRemoveProject && (
        <div
          className="confirm-popover-backdrop"
          onMouseDown={() => setConfirmRemoveProject(null)}
        >
          <div
            className="confirm-card confirm-danger"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-project-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="confirm-hide"
              title="Cancel"
              aria-label="Cancel removing project"
              onClick={() => setConfirmRemoveProject(null)}
            >
              <svg viewBox="0 0 14 14" width="13" height="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <path d="M3.5 3.5 L10.5 10.5 M10.5 3.5 L3.5 10.5" />
              </svg>
            </button>
            <div className="confirm-icon" aria-hidden="true">
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 4h10M6 4V2.5h4V4M5 4l.5 9h5l.5-9" />
              </svg>
            </div>
            <div className="confirm-copy">
              <h3 id="remove-project-title">Close this project?</h3>
              <p>
                Remove <strong>{confirmRemoveProject.name}</strong> from the projects list.
                Your files won&apos;t be deleted.
              </p>
            </div>
            <div className="confirm-actions">
              <button
                className="confirm-secondary"
                onClick={() => setConfirmRemoveProject(null)}
              >
                Cancel
              </button>
              <button
                className="confirm-primary"
                onClick={() => {
                  removeRecentProject(confirmRemoveProject.path)
                  setConfirmRemoveProject(null)
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        className={`side-user ${profile.name ? '' : 'unset'}`}
        title={profile.name ? 'Edit profile' : 'Add your name'}
        onClick={() => toggleProfileSetup(true)}
      >
        <div className={`avatar ${profile.avatar ? 'has-image' : ''}`}>
          {profile.avatar ? (
            <img src={profile.avatar} alt="" />
          ) : (
            userInitials(profile.name)
          )}
        </div>
        <div className="user-copy">
          <div className="u-name">{profile.name || 'Add your name'}</div>
          <div className="u-state">{profile.name ? (profile.role || 'Online') : 'Set up your profile'}</div>
        </div>
      </button>
    </aside>
  )
}
