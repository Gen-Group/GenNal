import { useEffect, useRef, useState } from 'react'
import { APP_VERSION } from '../version'

const REPO = 'https://github.com/Gen-Group/GenNal'
const GITHUB_PROFILE = 'https://github.com/chydevit'

// Community/social links.
const LINKS = {
  docs: `${REPO}#readme`,
  changelog: `${REPO}/releases`,
  github: GITHUB_PROFILE,
  discord: 'https://discord.gg/gennal',
  x: 'https://x.com/ChyDevit54942',
  feedback: `${REPO}/issues/new`
}

function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}

/** Compare dotted version strings: true when `a` is newer than `b`. */
function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) return da > db
  }
  return false
}

interface UpdateState {
  status: 'idle' | 'checking' | 'latest' | 'available' | 'error'
  message?: string
  url?: string
}

const isMac = window.api?.isMac ?? false
const MOD = isMac ? '⌘' : 'Ctrl'

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: `${MOD} K`, label: 'Open command palette' },
  { keys: `${MOD} N`, label: 'New window' },
  { keys: `${MOD} ⇧ B`, label: 'Open website preview' },
  { keys: 'Esc', label: 'Close palette / dialogs' }
]

function ExternalIcon(): JSX.Element {
  return (
    <svg className="help-ext" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3H3.5v9.5H13V10" />
      <path d="M9 3h4v4M13 3l-5.5 5.5" />
    </svg>
  )
}

export default function HelpMenu(): JSX.Element {
  const [open, setOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [update, setUpdate] = useState<UpdateState>({ status: 'idle' })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!shortcutsOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setShortcutsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcutsOpen])

  const checkForUpdates = async (): Promise<void> => {
    setUpdate({ status: 'checking' })
    try {
      const res = await fetch(`https://api.github.com/repos/Gen-Group/GenNal/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' }
      })
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as { tag_name?: string; html_url?: string }
      const tag = (data.tag_name ?? '').replace(/^v/, '')
      if (tag && isNewer(tag, APP_VERSION)) {
        setUpdate({ status: 'available', message: `Update available: v${tag}`, url: data.html_url })
      } else {
        setUpdate({ status: 'latest', message: `You're on the latest version (v${APP_VERSION})` })
      }
    } catch {
      setUpdate({ status: 'error', message: 'Could not check — open releases', url: `${REPO}/releases` })
    }
  }

  const act = (fn: () => void): void => {
    fn()
    setOpen(false)
  }

  return (
    <div className="help-anchor" ref={ref}>
      <button
        className={`sb-btn ${open ? 'active' : ''}`}
        title="Help"
        aria-label="Help"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
          <circle cx="8" cy="8" r="6.2" />
          <path d="M6.2 6.3a1.9 1.9 0 1 1 2.6 1.8c-.5.3-.8.6-.8 1.2" strokeLinecap="round" />
          <circle cx="8" cy="11.4" r="0.5" fill="currentColor" stroke="none" />
        </svg>
      </button>

      {open && (
        <div className="help-menu" role="menu">
          <button className="help-item" role="menuitem" onClick={() => act(() => setShortcutsOpen(true))}>
            <svg className="help-ico" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="1.5" y="4" width="13" height="8" rx="1.5" />
              <path d="M4 6.5h.01M6 6.5h.01M8 6.5h.01M10 6.5h.01M12 6.5h.01M4.5 9.3h7" />
            </svg>
            <span className="help-label">Keyboard Shortcuts</span>
          </button>

          <div className="help-sep" />

          <button className="help-item" role="menuitem" onClick={() => act(() => openExternal(LINKS.feedback))}>
            <svg className="help-ico" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 3.5h10v7H6l-3 2.5z" />
            </svg>
            <span className="help-label">Send Feedback</span>
          </button>
          <button className="help-item" role="menuitem" onClick={() => act(() => openExternal(LINKS.docs))}>
            <svg className="help-ico" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 3h5.5a1.5 1.5 0 0 1 1.5 1.5V13H4.5A1.5 1.5 0 0 1 3 11.5z" />
              <path d="M13 3H10v10h1.5A1.5 1.5 0 0 0 13 11.5z" />
            </svg>
            <span className="help-label">Docs</span>
            <ExternalIcon />
          </button>
          <button className="help-item" role="menuitem" onClick={() => act(() => openExternal(LINKS.changelog))}>
            <svg className="help-ico" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="2.5" width="10" height="11" rx="1.4" />
              <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" />
            </svg>
            <span className="help-label">Changelog</span>
            <ExternalIcon />
          </button>

          <div className="help-sep" />

          <button className="help-item" role="menuitem" onClick={() => act(() => openExternal(LINKS.github))}>
            <svg className="help-ico" viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
              <path d="M8 .2a8 8 0 0 0-2.5 15.6c.4.07.55-.17.55-.38v-1.3c-2.2.48-2.67-1.06-2.67-1.06-.36-.92-.88-1.16-.88-1.16-.72-.5.05-.48.05-.48.8.06 1.22.82 1.22.82.71 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.75-.2-3.6-.88-3.6-3.9 0-.86.3-1.57.82-2.12-.08-.2-.36-1 .08-2.1 0 0 .67-.21 2.2.8a7.6 7.6 0 0 1 4 0c1.52-1.02 2.19-.8 2.19-.8.44 1.1.16 1.9.08 2.1.51.55.82 1.26.82 2.12 0 3.03-1.85 3.7-3.61 3.9.29.24.54.72.54 1.46v2.16c0 .21.15.46.55.38A8 8 0 0 0 8 .2Z" />
            </svg>
            <span className="help-label">GitHub</span>
            <ExternalIcon />
          </button>
          <button className="help-item" role="menuitem" onClick={() => act(() => openExternal(LINKS.discord))}>
            <svg className="help-ico" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M13.2 3.5A11 11 0 0 0 10.5 2.7l-.2.3a9 9 0 0 1 2.4 1.2 8 8 0 0 0-9.4 0 9 9 0 0 1 2.4-1.2l-.2-.3A11 11 0 0 0 2.8 3.5 11.4 11.4 0 0 0 1 11.3a11 11 0 0 0 3.3 1.7l.4-.7a7 7 0 0 1-1.1-.6l.3-.2a5.7 5.7 0 0 0 8.2 0l.3.2a7 7 0 0 1-1.1.6l.4.7a11 11 0 0 0 3.3-1.7 11.4 11.4 0 0 0-1.8-7.8ZM5.8 9.7c-.5 0-1-.5-1-1.1s.4-1.1 1-1.1 1 .5 1 1.1-.4 1.1-1 1.1Zm4.4 0c-.5 0-1-.5-1-1.1s.4-1.1 1-1.1 1 .5 1 1.1-.4 1.1-1 1.1Z" />
            </svg>
            <span className="help-label">Discord</span>
            <ExternalIcon />
          </button>
          <button className="help-item" role="menuitem" onClick={() => act(() => openExternal(LINKS.x))}>
            <svg className="help-ico" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M9.5 7 14 2h-1.3L9 6.3 5.9 2H2l4.7 6.6L2 14h1.3L7.4 9.4 10.6 14H14L9.5 7Zm-1.5 1.6-.5-.7L3.6 3h1.5l3 4.2.5.7 4 5.6h-1.5L8 8.6Z" />
            </svg>
            <span className="help-label">X</span>
            <ExternalIcon />
          </button>

          <div className="help-sep" />

          <button
            className="help-item"
            role="menuitem"
            onClick={() => {
              void checkForUpdates()
            }}
          >
            <svg className={`help-ico ${update.status === 'checking' ? 'help-spin' : ''}`} viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M13 3v3h-3" />
              <path d="M13 6A5.5 5.5 0 1 0 13.5 9" />
            </svg>
            <span className="help-label">Check for Updates</span>
          </button>
          {update.status !== 'idle' && (
            <button
              className={`help-update ${update.status}`}
              disabled={!update.url}
              onClick={() => {
                if (update.url) act(() => openExternal(update.url as string))
              }}
            >
              {update.status === 'checking' ? 'Checking…' : update.message}
            </button>
          )}
        </div>
      )}

      {shortcutsOpen && (
        <div className="kbd-backdrop" onMouseDown={() => setShortcutsOpen(false)}>
          <div
            className="kbd-card"
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="kbd-head">
              <span>Keyboard Shortcuts</span>
              <button className="kbd-close" aria-label="Close" onClick={() => setShortcutsOpen(false)}>
                <svg viewBox="0 0 14 14" width="13" height="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M3.5 3.5 10.5 10.5 M10.5 3.5 3.5 10.5" />
                </svg>
              </button>
            </div>
            <div className="kbd-list">
              {SHORTCUTS.map((s) => (
                <div className="kbd-row" key={s.label}>
                  <span>{s.label}</span>
                  <kbd>{s.keys}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
