import { useEffect, useState, type CSSProperties } from 'react'
import { useStore } from '../store'
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
  return <span className={`file-glyph kind-${fileKind(file)}`} aria-hidden="true" />
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
  const [folderMenu, setFolderMenu] = useState<{ folder: string; x: number; y: number } | null>(null)
  const [workspaceMenu, setWorkspaceMenu] = useState<{ x: number; y: number } | null>(null)
  const sessions = useStore((s) => s.sessions)
  const activeId = useStore((s) => s.activeId)
  const setActive = useStore((s) => s.setActive)
  const models = useStore((s) => s.models)
  const addSession = useStore((s) => s.addSession)
  const stats = useStore((s) => s.stats)
  const togglePalette = useStore((s) => s.togglePalette)
  const profile = useStore((s) => s.profile)
  const toggleProfileSetup = useStore((s) => s.toggleProfileSetup)
  const workspace = useStore((s) => s.workspace)
  const workspaceError = useStore((s) => s.workspaceError)
  const openWorkspace = useStore((s) => s.openWorkspace)
  const openWorkspaceFile = useStore((s) => s.openWorkspaceFile)
  const createWorkspaceFile = useStore((s) => s.createWorkspaceFile)
  const createWorkspaceFolder = useStore((s) => s.createWorkspaceFolder)
  const openImagePreview = useStore((s) => s.openImagePreview)
  const running = sessions.filter((s) => s.status === 'running').length
  const fileTree = workspace ? buildFileTree(workspace.files.slice(0, 120)) : undefined
  const menuFolder = folderMenu && fileTree ? findFolder(fileTree, folderMenu.folder) : undefined
  const workspaceName = workspace?.name ?? 'Open workspace'
  const primarySessions = sessions.slice(0, 3)
  const aiModel = models.find((model) => model.id === 'codex') ?? models.find((model) => model.id !== 'custom')
  const cliModel = models.find((model) => model.id === 'custom') ?? models[0]
  const git = workspace?.git
  const isRepo = Boolean(git)
  const branchName = git?.branch ?? ''
  const branchUrl = git?.branchUrl
  const hasRemote = Boolean(git?.remoteUrl)

  useEffect(() => {
    if (!folderMenu && !workspaceMenu) return
    const closeAll = (): void => {
      setFolderMenu(null)
      setWorkspaceMenu(null)
    }
    window.addEventListener('click', closeAll)
    window.addEventListener('keydown', closeAll)
    return () => {
      window.removeEventListener('click', closeAll)
      window.removeEventListener('keydown', closeAll)
    }
  }, [folderMenu, workspaceMenu])

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
        if (isImageFile(file)) void openImagePreview(file)
        else void openWorkspaceFile(file)
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
          <span className={`folder-chevron ${collapsedFolders.has(folder.path) ? 'collapsed' : ''}`} />
          <span className="folder-glyph" />
          <span>{folder.name}</span>
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
      <section className="side-sec">
        <div className="workspace-top">
          <span>Workspaces</span>
          <div className="workspace-tools">
            <button className="workspace-tool" title="Workspace filters" aria-label="Workspace filters">
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
        <div className="workspace-filter">
          <span className="list-icon" />
          <span>All</span>
          <span className="workspace-filter-count">{workspace ? 1 : 0}</span>
        </div>
        <div className={`workspace-stack ${workspace ? 'active' : ''}`}>
          {isRepo ? (
            <button
              className={`workspace-branch ${branchUrl ? 'linked' : ''}`}
              title={git?.remoteUrl ?? `Current branch: ${branchName}`}
              onClick={openBranch}
            >
              <span className="branch-icon" aria-hidden="true">
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="3" x2="4" y2="10" />
                  <circle cx="4" cy="12" r="1.7" />
                  <circle cx="12" cy="4" r="1.7" />
                  <path d="M12 5.7c0 3.4-2.7 4.3-6 4.3" />
                </svg>
              </span>
              <span className="branch-name">{branchName}</span>
              <span className="branch-pill">{hasRemote ? 'remote' : 'local'}</span>
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
          <button className="workspace-project" onClick={() => void openWorkspace('project')}>
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
                void openWorkspace('project')
                setWorkspaceMenu(null)
              }}
            >
              Upload Project
            </button>
          </div>
        )}
        {workspaceError && <div className="side-error">{workspaceError}</div>}
        {workspace && (
          <div className="file-list">
            {fileTree?.files.map(renderFile)}
            {fileTree?.folders.map((folder) => renderFolder(folder))}
            {workspace.files.length > 120 && (
              <div className="file-more">+{workspace.files.length - 120} more files</div>
            )}
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

      <section className="side-sec">
        <div className="side-head"><span>SYSTEM OVERVIEW</span></div>
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
      </section>

      <section className="side-sec">
        <div className="side-head"><span>QUICK ACTIONS</span></div>
        <button className="qa" onClick={() => togglePalette(true)}>
          Command Palette <kbd>Ctrl K</kbd>
        </button>
        <button className="qa" onClick={() => window.api.win.newWindow()}>
          New Window <kbd>Ctrl N</kbd>
        </button>
        <button className="qa soon" disabled title="Mobile app — coming soon">
          Mobile <span className="soon-pill">Coming soon</span>
        </button>
      </section>

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
        <div>
          <div className="u-name">{profile.name || 'Add your name'}</div>
          <div className="u-state">{profile.name ? (profile.role || '● Online') : 'Set up your profile'}</div>
        </div>
      </button>
    </aside>
  )
}
