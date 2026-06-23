import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { useStore, type ProjectIconMode, type ProjectRuntime } from '../store'
import type { ProjectInfo } from '../../../shared/types'
import { accentForPath as fallbackAccent } from '../accents'

const COLORS = ['#8a8f98', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#7c5cff', '#ec4899']

const EMOJIS = ['🚀', '🛠️', '📦', '🔥', '⭐', '🐙', '🧠', '🌱', '⚡', '🎯', '🧪', '🔧', '💡', '📱', '🌐', '🗂️']

const ICONS: Record<string, ReactNode> = {
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  code: (
    <>
      <polyline points="8 7 3 12 8 17" />
      <polyline points="16 7 21 12 16 17" />
    </>
  ),
  terminal: (
    <>
      <rect x="2" y="3" width="20" height="18" rx="3" />
      <polyline points="6 9 9 12 6 15" />
      <line x1="12" y1="15" x2="17" y2="15" />
    </>
  ),
  rocket: <path d="M5 15c-1 1-1 4-1 4s3 0 4-1l2-2-3-3-2 2zM14 4c3 0 6 3 6 6 0 3-7 9-9 9l-3-3c0-2 6-9 9-9z" />,
  star: <polygon points="12 3 14.9 9 21 9.7 16.5 14 17.8 20 12 17 6.2 20 7.5 14 3 9.7 9.1 9" />,
  box: (
    <>
      <path d="M21 8L12 3 3 8v8l9 5 9-5z" />
      <path d="M3 8l9 5 9-5M12 13v8" />
    </>
  ),
  leaf: <path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14zM5 19c4-4 7-6 10-7" />,
  flame: <path d="M12 3c3 4 5 6 5 9a5 5 0 0 1-10 0c0-1.5.7-2.7 1.5-3.5C9 9.5 11 7 12 3z" />
}

function GlyphIcon({ name }: { name: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name] ?? ICONS.folder}
    </svg>
  )
}

interface Props {
  path: string
  onClose: () => void
  /** Called after the project is removed so the parent can leave this view. */
  onDeleted: () => void
}

export default function ProjectSettingsPanel({ path, onClose, onDeleted }: Props): JSX.Element {
  const recentProjects = useStore((s) => s.recentProjects)
  const settings = useStore((s) => s.projectSettings[path.toLowerCase()])
  const setProjectSettings = useStore((s) => s.setProjectSettings)
  const removeRecentProject = useStore((s) => s.removeRecentProject)
  const isMac = window.api.isMac

  const folderName = useMemo(
    () => recentProjects.find((p) => p.path.toLowerCase() === path.toLowerCase())?.name ?? path.split(/[\\/]/).pop() ?? path,
    [recentProjects, path]
  )

  const [info, setInfo] = useState<ProjectInfo | null>(null)
  const [tab, setTab] = useState<ProjectIconMode>(settings?.iconMode ?? 'avatar')
  const [faviconInput, setFaviconInput] = useState('')
  const [branchQuery, setBranchQuery] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    setInfo(null)
    void window.api.projectInfo(path).then((result) => {
      if (alive) setInfo(result)
    })
    return () => {
      alive = false
    }
  }, [path])

  // Reset transient inputs and the active tab when switching projects.
  useEffect(() => {
    setTab(settings?.iconMode ?? 'avatar')
    setFaviconInput('')
    setBranchQuery('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  const accent = settings?.color ?? fallbackAccent(path)
  const displayName = settings?.displayName ?? folderName
  const runtime: ProjectRuntime = settings?.runtime ?? 'default'

  const patch = (next: Parameters<typeof setProjectSettings>[1]): void => setProjectSettings(path, next)

  const resetIcon = (): void =>
    patch({ color: undefined, iconMode: undefined, emoji: undefined, icon: undefined, image: undefined })

  const useGithubAvatar = (): void => {
    if (!info?.owner) return
    patch({ iconMode: 'avatar', image: `https://github.com/${info.owner}.png?size=128` })
    setTab('avatar')
  }

  const useFavicon = (): void => {
    const host = faviconInput.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    if (!host) return
    patch({ iconMode: 'avatar', image: `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(host)}` })
    setTab('avatar')
  }

  const onUploadPng = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 256 * 1024) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') patch({ iconMode: 'avatar', image: reader.result })
    }
    reader.readAsDataURL(file)
    setTab('avatar')
  }

  const handleDelete = (): void => {
    removeRecentProject(path)
    onDeleted()
  }

  const primaryBranch = info?.primaryBranch
  const worktreeBase = settings?.worktreeBase ?? primaryBranch ?? info?.currentBranch ?? ''
  const filteredBranches = useMemo(() => {
    const all = info?.branches ?? []
    const q = branchQuery.trim().toLowerCase()
    const list = q ? all.filter((b) => b.toLowerCase().includes(q)) : all
    return list.slice(0, 12)
  }, [info, branchQuery])

  const runtimeLabel: Record<ProjectRuntime, string> = {
    default: isMac ? 'Default' : 'Default (WSL)',
    windows: 'Windows',
    wsl: 'WSL'
  }

  // The preview always reflects the saved icon, regardless of which tab is open.
  const preview = ((): ReactNode => {
    if (settings?.iconMode === 'avatar' && settings.image) return <img src={settings.image} alt="" />
    if (settings?.iconMode === 'emoji' && settings.emoji) return <span className="project-icon-emoji">{settings.emoji}</span>
    if (settings?.iconMode === 'icon' && settings.icon) return <GlyphIcon name={settings.icon} />
    return <span>{displayName.trim().charAt(0).toUpperCase() || 'P'}</span>
  })()

  const iconModeLabel =
    settings?.iconMode === 'avatar'
      ? 'Avatar'
      : settings?.iconMode === 'icon'
        ? 'Custom icon'
        : settings?.iconMode === 'emoji'
          ? 'Emoji'
          : 'Monogram'

  return (
    <div className="project-settings">
      <div className="settings-main-head">
        <div>
          <div className="settings-kicker">Project Settings</div>
          <h2>{displayName}</h2>
          <div className="project-settings-path" title={path}>
            {path}
          </div>
        </div>
        <button className="settings-close" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="settings-content">
        {/* Identity + icon */}
        <div className="project-card">
          <div className="project-card-head">
            <div>
              <h3>Identity</h3>
              <p>Project-specific display details for the sidebar and tabs.</p>
              <p className="project-meta">
                Type: <strong>{info ? (info.isGit ? 'Git' : 'Folder') : '…'}</strong>
              </p>
            </div>
            <button className="project-delete" title="Remove project" onClick={handleDelete} aria-label="Remove project">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>

          <label className="project-field">
            <span>Display Name</span>
            <input
              value={displayName}
              spellCheck={false}
              onChange={(e) => patch({ displayName: e.target.value })}
              placeholder={folderName}
            />
          </label>

          <div className="project-icon-row">
            <div className="project-icon-preview" style={{ background: accent }}>
              {preview}
            </div>
            <div className="project-icon-meta">
              <strong>Repo Icon</strong>
              <span>{iconModeLabel}</span>
            </div>
            <button className="settings-close" onClick={resetIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="project-btn-icon">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                <polyline points="3 3 3 8 8 8" />
              </svg>
              Reset
            </button>
          </div>

          <div className="project-subhead">Color</div>
          <div className="project-colors">
            {COLORS.map((color) => (
              <button
                key={color}
                className={`project-swatch ${accent.toLowerCase() === color.toLowerCase() ? 'active' : ''}`}
                style={{ background: color }}
                onClick={() => patch({ color })}
                aria-label={`Use color ${color}`}
              />
            ))}
            <label className="project-custom-color">
              <input type="color" value={accent} onChange={(e) => patch({ color: e.target.value })} />
              <span>Custom</span>
            </label>
          </div>

          <div className="project-tabs">
            {(['avatar', 'icon', 'emoji'] as ProjectIconMode[]).map((id) => (
              <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
                {id === 'avatar' ? 'Avatar' : id === 'icon' ? 'Icon' : 'Emoji'}
              </button>
            ))}
          </div>

          {tab === 'avatar' && (
            <div className="project-tab-body">
              <button className="project-wide-btn" onClick={useGithubAvatar} disabled={!info?.owner}>
                <svg viewBox="0 0 24 24" fill="currentColor" className="project-btn-icon">
                  <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.1-1.47-1.1-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z" />
                </svg>
                Use GitHub Avatar
              </button>
              <p className="project-hint">
                {info?.owner
                  ? 'Used by default — GitHub always provides one, even when the owner hasn’t set a custom image.'
                  : 'No GitHub remote detected for this project.'}
              </p>
              <div className="project-upload-row">
                <button className="settings-close" onClick={() => fileInputRef.current?.click()}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="project-btn-icon">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                  Upload PNG
                </button>
                <input ref={fileInputRef} type="file" accept="image/png,image/*" hidden onChange={onUploadPng} />
              </div>
              <div className="project-favicon-row">
                <input
                  value={faviconInput}
                  placeholder="example.com"
                  spellCheck={false}
                  onChange={(e) => setFaviconInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && useFavicon()}
                />
                <button className="settings-close" onClick={useFavicon}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="project-btn-icon">
                    <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
                    <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5" />
                  </svg>
                  Favicon
                </button>
              </div>
              <p className="project-hint">PNG uploads must be 256KB or smaller.</p>
            </div>
          )}

          {tab === 'icon' && (
            <div className="project-tab-body">
              <div className="project-glyph-grid">
                {Object.keys(ICONS).map((name) => (
                  <button
                    key={name}
                    className={`project-glyph ${settings?.icon === name ? 'active' : ''}`}
                    onClick={() => patch({ iconMode: 'icon', icon: name })}
                    aria-label={name}
                  >
                    <GlyphIcon name={name} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === 'emoji' && (
            <div className="project-tab-body">
              <div className="project-emoji-grid">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    className={`project-emoji ${settings?.emoji === emoji ? 'active' : ''}`}
                    onClick={() => patch({ iconMode: 'emoji', emoji })}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Runtime */}
        <div className="project-card">
          <div className="project-card-head">
            <div>
              <h3>Project runtime</h3>
              <p>Choose the platform terminals and agent checks use for this project.</p>
            </div>
            <div className="settings-segment">
              {(['default', 'windows', 'wsl'] as ProjectRuntime[]).map((id) => (
                <button
                  key={id}
                  className={runtime === id ? 'active' : ''}
                  onClick={() => patch({ runtime: id })}
                >
                  {runtimeLabel[id]}
                </button>
              ))}
            </div>
          </div>
          <p className="project-hint">
            Runtime changes apply to new terminals, agent checks, and skill discovery for this project. Existing terminals
            keep their current runtime.
          </p>
        </div>

        {/* Worktree base */}
        <div className="project-card">
          <div className="project-card-head">
            <div>
              <h3>Default Worktree Base</h3>
              <p>The branch new worktrees and sessions are created from.</p>
            </div>
          </div>

          <div className="project-worktree-current">
            <div className="project-worktree-name">
              <strong>{worktreeBase || 'No branch'}</strong>
              <span>
                {primaryBranch
                  ? `Following primary branch (${primaryBranch})`
                  : info?.isGit
                    ? 'No upstream branch detected'
                    : 'Not a git repository'}
              </span>
            </div>
            <button
              className="settings-close"
              disabled={!primaryBranch}
              onClick={() => primaryBranch && patch({ worktreeBase: primaryBranch })}
            >
              Use Primary
            </button>
          </div>

          {info?.isGit && (
            <>
              <input
                className="project-branch-search"
                value={branchQuery}
                placeholder="Search branches by name…"
                spellCheck={false}
                onChange={(e) => setBranchQuery(e.target.value)}
              />
              {filteredBranches.length > 0 ? (
                <ul className="project-branch-list">
                  {filteredBranches.map((branch) => (
                    <li key={branch}>
                      <button
                        className={worktreeBase === branch ? 'active' : ''}
                        onClick={() => patch({ worktreeBase: branch })}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="project-branch-icon">
                          <line x1="6" y1="4" x2="6" y2="15" />
                          <circle cx="6" cy="18" r="2.5" />
                          <circle cx="18" cy="6" r="2.5" />
                          <path d="M18 8.5c0 5-4 6.5-9 6.5" />
                        </svg>
                        <span>{branch}</span>
                        {worktreeBase === branch && <span className="project-branch-check">✓</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="project-hint">{branchQuery ? 'No branches match your search.' : 'No branches found.'}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
