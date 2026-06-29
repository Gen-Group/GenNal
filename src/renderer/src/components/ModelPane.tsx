import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent
} from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import { useStore, scrollbackLines, windowsShellCommand, type Session, type SplitDirection } from '../store'
import { isLocalhostUrl } from '../preview-links'
import { playNotificationSound } from '../notification-sound'
import TerminalFindBar from './TerminalFindBar'
import { getTerminalTheme } from '../theme-colors'
import { startPlainTerminalSelection } from '../terminal-selection'

function isTerminalReport(data: string): boolean {
  return /^\x1b\[\?1;2c$/.test(data) || /^\x1b\[\?6c$/.test(data) || /^\x1b\[\d+;\d+R$/.test(data)
}

interface KeyLikeEvent {
  altKey: boolean
  ctrlKey: boolean
  key: string
  metaKey: boolean
}

interface AttachmentNotice {
  name: string
}

type DroppedFile = File & { path?: string }

function keyToPtyData(e: KeyLikeEvent): string | null {
  if (e.ctrlKey && e.key.length === 1) {
    const code = e.key.toUpperCase().charCodeAt(0)
    if (code >= 65 && code <= 90) return String.fromCharCode(code - 64)
  }

  switch (e.key) {
    case 'Enter':
      return '\r'
    case 'Backspace':
      return '\x7f'
    case 'Tab':
      return '\t'
    case 'Escape':
      return '\x1b'
    case 'ArrowUp':
      return '\x1b[A'
    case 'ArrowDown':
      return '\x1b[B'
    case 'ArrowRight':
      return '\x1b[C'
    case 'ArrowLeft':
      return '\x1b[D'
    case 'Home':
      return '\x1b[H'
    case 'End':
      return '\x1b[F'
    case 'Delete':
      return '\x1b[3~'
    default:
      return e.key.length === 1 && !e.altKey && !e.metaKey ? e.key : null
  }
}

// Custom drag type carrying a session id when a pane header is dragged onto
// another pane to reorder it. Distinct from file drops (which carry no such
// type), so the two drag flows never collide.
const PANE_DND = 'application/x-gennal-pane'

function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)$/i.test(path)
}

function quotePath(path: string): string {
  return `"${path.replace(/"/g, '\\"')}"`
}

export default function ModelPane({
  session,
  hidden = false,
  number
}: {
  session: Session
  /** Hidden in place (kept mounted so the pty stays alive) when not the active project's pane. */
  hidden?: boolean
  /** 1-based terminal number within the active project. Falls back to global order. */
  number?: number
}): JSX.Element {
  const paneRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const searchRef = useRef<SearchAddon | null>(null)
  const [findOpen, setFindOpen] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)
  // Collapse the pane to a header-only bar (docked at the grid bottom by
  // PaneGrid). The pty keeps running underneath; expanding restores it. State
  // lives in the store so the grid can lay collapsed panes out separately.
  const collapsed = useStore((s) => s.collapsedIds.includes(session.id))
  const toggleSessionCollapsed = useStore((s) => s.toggleSessionCollapsed)
  // Drag the header to reorder panes in the grid. `dropActive` highlights this
  // pane as a drop target; `dragging` dims the one being moved.
  const [dropActive, setDropActive] = useState(false)
  const [dragging, setDragging] = useState(false)
  const splitRef = useRef<HTMLDivElement>(null)
  const noticeTimerRef = useRef<number | null>(null)
  // The terminal effect (keyed by session.id) needs a stable hook into the
  // latest paste handler, and a guard so a single Ctrl+V isn't pasted twice when
  // both the key handler and a DOM paste event fire.
  const pasteRef = useRef<() => void>(() => {})
  const lastPasteRef = useRef(0)
  // The URL the mouse is currently hovering in the terminal (if any), so a
  // right-click can open it in the in-app website preview.
  const hoveredUrlRef = useRef<string | null>(null)
  const [attachmentNotice, setAttachmentNotice] = useState<AttachmentNotice | null>(null)
  const setStatus = useStore((s) => s.setStatus)
  const removeSession = useStore((s) => s.removeSession)
  const moveSession = useStore((s) => s.moveSession)
  const setActive = useStore((s) => s.setActive)
  const activeId = useStore((s) => s.activeId)
  const sessions = useStore((s) => s.sessions)
  const addSession = useStore((s) => s.addSession)
  const splitSession = useStore((s) => s.splitSession)
  const openPreview = useStore((s) => s.openPreview)
  const terminalSettings = useStore((s) => s.terminalSettings)
  const notificationSettings = useStore((s) => s.notificationSettings)
  const theme = useStore((s) => s.theme)
  const terminalNumber = sessions.findIndex((s) => s.id === session.id) + 1

  // The terminal effect is keyed by session.id, so it can't see later setting
  // changes; mirror the latest settings in refs the event handlers read.
  const settingsRef = useRef(terminalSettings)
  useEffect(() => {
    settingsRef.current = terminalSettings
  }, [terminalSettings])

  const notificationRef = useRef(notificationSettings)
  useEffect(() => {
    notificationRef.current = notificationSettings
  }, [notificationSettings])

  // Plain shell panes (modelId 'custom') aren't AI runs, so their bells never
  // trigger the run-complete sound.
  const isAiPane = session.modelId !== 'custom'

  useEffect(() => {
    if (!termRef.current) return
    const term = new Terminal({
      fontFamily: terminalSettings.fontFamily,
      fontSize: terminalSettings.fontSize,
      cursorBlink: terminalSettings.cursorBlink,
      scrollback: scrollbackLines(terminalSettings),
      wordSeparator: terminalSettings.wordSeparators,
      theme: getTerminalTheme(session.accent)
    })
    terminalRef.current = term

    const fit = new FitAddon()
    term.loadAddon(fit)

    const search = new SearchAddon()
    term.loadAddon(search)
    searchRef.current = search

    // Detect URLs in the output: underline them on hover, and open them when
    // clicked — localhost dev servers in the in-app preview, everything else in
    // the system browser. The hovered URL is remembered so a right-click (below)
    // can open it too.
    const openUrl = (uri: string): void => {
      if (!/^https?:\/\//i.test(uri)) return
      if (isLocalhostUrl(uri)) useStore.getState().openPreview(uri)
      else window.api.openExternal(uri)
    }
    term.loadAddon(
      new WebLinksAddon((_event, uri) => openUrl(uri), {
        hover: (_event, uri) => {
          hoveredUrlRef.current = uri
        },
        leave: () => {
          hoveredUrlRef.current = null
        }
      })
    )

    term.open(termRef.current)
    fit.fit()
    term.focus()

    const copySelection = (clear = true): boolean => {
      const selection = term.getSelection()
      if (!selection) return false
      window.api.writeClipboardText(selection)
      if (clear) term.clearSelection()
      return true
    }

    // xterm has no built-in copy/paste: wire Ctrl/Cmd+C (when text is selected)
    // to copy, and Ctrl/Cmd+V (and Ctrl/Cmd+Shift+V) to paste. Without this, V
    // falls through to xterm and the raw control char ^V (0x16) is sent to the
    // pty instead of pasting — which is why nothing could be pasted.
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true
      const mod = window.api.isMac ? event.metaKey : event.ctrlKey
      const isC = event.key === 'c' || event.key === 'C'
      const isV = event.key === 'v' || event.key === 'V'
      const isF = event.key === 'f' || event.key === 'F'
      if (mod && isC && (event.shiftKey || term.hasSelection())) {
        if (copySelection()) return false
      }
      if (mod && isV) {
        pasteRef.current()
        return false
      }
      if (mod && isF && !event.shiftKey && !event.altKey) {
        setFindOpen(true)
        return false
      }
      return true
    })

    // Copy on select: mirror the selection to the clipboard as it changes.
    const onSelection = term.onSelectionChange(() => {
      if (!settingsRef.current.copyOnSelect) return
      const selection = term.getSelection()
      if (selection) window.api.writeClipboardText(selection)
    })

    // AI CLIs ring the terminal bell when a run finishes; turn that into an
    // audible alert when the user has the run-complete sound enabled.
    const onBell = term.onBell(() => {
      const notify = notificationRef.current
      if (isAiPane && notify.enabled && notify.runCompleteSound) {
        playNotificationSound(notify.sound)
      }
    })

    const { id, command, cwd } = session
    // Honour the user's Windows shell choice (Command Prompt / PowerShell /
    // Git Bash / WSL) for grid terminals too — not just the bottom panel.
    window.api.ptyCreate({ id, command, cwd, shell: windowsShellCommand(settingsRef.current.windowsShell) })
    setStatus(id, 'running')

    // Opening a terminal or running a command never opens the preview on its
    // own: URLs a model prints are left as clickable links (see openUrl above),
    // so the preview only opens when the user clicks a localhost URL.
    const offData = window.api.onPtyData((d) => {
      if (d.id === id) term.write(d.data)
    })
    const offExit = window.api.onPtyExit((d) => {
      if (d.id === id) setStatus(id, 'stopped')
    })
    const onInput = term.onData((data) => {
      if (isTerminalReport(data)) return
      window.api.ptyInput(id, data)
    })

    const resize = (): void => {
      try {
        fit.fit()
        window.api.ptyResize(id, term.cols, term.rows)
      } catch {
        /* ignore */
      }
    }
    const ro = new ResizeObserver(resize)
    ro.observe(termRef.current)
    requestAnimationFrame(resize)

    return () => {
      ro.disconnect()
      offData()
      offExit()
      onInput.dispose()
      onSelection.dispose()
      onBell.dispose()
      window.api.ptyKill(id)
      term.dispose()
      terminalRef.current = null
      searchRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])

  // Close the split-direction popover on an outside click or Escape.
  useEffect(() => {
    if (!splitOpen) return
    const onDown = (e: globalThis.MouseEvent): void => {
      if (!splitRef.current?.contains(e.target as Node)) setSplitOpen(false)
    }
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') setSplitOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [splitOpen])

  useEffect(() => {
    const term = terminalRef.current
    if (!term) return
    term.options.fontFamily = terminalSettings.fontFamily
    term.options.fontSize = terminalSettings.fontSize
    term.options.cursorBlink = terminalSettings.cursorBlink
    term.options.scrollback = scrollbackLines(terminalSettings)
    term.options.wordSeparator = terminalSettings.wordSeparators
  }, [terminalSettings])

  // Re-theme the live terminal when the app theme changes — without recreating
  // it (which would kill the pty). Mirrors the chrome's token-driven theming.
  useEffect(() => {
    const term = terminalRef.current
    if (term) term.options.theme = getTerminalTheme(session.accent)
  }, [theme, session.accent])

  useEffect(() => {
    if (activeId === session.id) {
      requestAnimationFrame(() => terminalRef.current?.focus())
    }
  }, [activeId, session.id])

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
    }
  }, [])

  const focusPane = (): void => {
    setActive(session.id)
    paneRef.current?.focus()
    terminalRef.current?.focus()
  }

  const showAttachmentNotice = (notice: AttachmentNotice): void => {
    setAttachmentNotice(notice)
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = window.setTimeout(() => {
      setAttachmentNotice(null)
      noticeTimerRef.current = null
    }, 3200)
  }

  const insertAttachmentPath = (path: string): void => {
    setActive(session.id)
    window.api.ptyInput(session.id, quotePath(path))
    terminalRef.current?.focus()
  }

  const onPanePaste = (e: ReactClipboardEvent<HTMLDivElement>): void => {
    // The Ctrl/Cmd+V keybinding may have just handled this same paste.
    if (!claimPaste()) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    const text = e.clipboardData.getData('text/plain')
    if (text) {
      e.preventDefault()
      e.stopPropagation()
      setActive(session.id)
      terminalRef.current?.paste(text)
      terminalRef.current?.focus()
      return
    }

    // No plain text on the clipboard, so the only useful payload is an image.
    // Cancel the default paste unconditionally — otherwise a Windows screenshot
    // (PrintScreen / Snipping Tool) is a raw bitmap that Chromium doesn't surface
    // as a DOM file item, so it leaks through to the terminal where the running
    // CLI tries to paste it itself and fails with "no image on clipboard". GenNal
    // attaches the image via the OS clipboard below; saveClipboardImage() returns
    // null when there's genuinely nothing to attach.
    e.preventDefault()
    e.stopPropagation()
    void attachClipboardImage()
  }

  const attachClipboardImage = async (): Promise<void> => {
    try {
      const attachment = await window.api.saveClipboardImage(session.projectPath)
      if (!attachment) return
      insertAttachmentPath(attachment.path)
      showAttachmentNotice({ name: attachment.name })
    } catch {
      showAttachmentNotice({ name: 'Unable to attach clipboard image' })
    }
  }

  // One paste may arrive via the keyboard handler and/or a DOM paste event;
  // collapse near-simultaneous calls so the clipboard isn't pasted twice.
  const claimPaste = (): boolean => {
    const now = Date.now()
    if (now - lastPasteRef.current < 120) return false
    lastPasteRef.current = now
    return true
  }

  // Explicit paste used by the Ctrl/Cmd+V keybinding: drop clipboard text into
  // the terminal, or — when there's only an image — save it and type its path so
  // CLIs like Claude Code can read it.
  const pasteIntoTerminal = (): void => {
    if (!claimPaste()) return
    setActive(session.id)
    void (async () => {
      try {
        const text = await window.api.readClipboardText()
        if (text) {
          terminalRef.current?.paste(text)
          terminalRef.current?.focus()
          return
        }
      } catch {
        /* fall through to image attach */
      }
      await attachClipboardImage()
    })()
  }
  pasteRef.current = pasteIntoTerminal

  // The header is a drag handle: grab it to move this pane onto another.
  const onHeadDragStart = (e: ReactDragEvent<HTMLDivElement>): void => {
    e.dataTransfer.setData(PANE_DND, session.id)
    e.dataTransfer.effectAllowed = 'move'
    setDragging(true)
  }
  const onHeadDragEnd = (): void => setDragging(false)

  const onPaneDrop = (e: ReactDragEvent<HTMLDivElement>): void => {
    // A pane drop reorders the grid; a file drop attaches an image path.
    const movedId = e.dataTransfer.getData(PANE_DND)
    if (movedId) {
      e.preventDefault()
      e.stopPropagation()
      setDropActive(false)
      if (movedId !== session.id) moveSession(movedId, session.id)
      return
    }

    const file = Array.from(e.dataTransfer.files).find((entry) => {
      const dropped = entry as DroppedFile
      return dropped.path && isImagePath(dropped.path)
    }) as DroppedFile | undefined

    if (!file?.path) return
    e.preventDefault()
    e.stopPropagation()

    insertAttachmentPath(file.path)
    showAttachmentNotice({ name: file.name })
  }

  const onPaneDragOver = (e: ReactDragEvent<HTMLDivElement>): void => {
    if (e.dataTransfer.types.includes(PANE_DND)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (!dragging && !dropActive) setDropActive(true)
      return
    }
    const hasFile = Array.from(e.dataTransfer.items).some((item) => item.kind === 'file')
    if (!hasFile) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const onPaneDragLeave = (e: ReactDragEvent<HTMLDivElement>): void => {
    if (!paneRef.current?.contains(e.relatedTarget as Node)) setDropActive(false)
  }

  const onPaneKeyDown = (e: ReactKeyboardEvent): void => {
    const target = e.target as HTMLElement
    if (target.closest('.xterm')) return
    const mod = window.api.isMac ? e.metaKey : e.ctrlKey
    if (mod && (e.key === 'v' || e.key === 'V')) return

    const data = keyToPtyData(e)
    if (!data) return
    e.preventDefault()
    setActive(session.id)
    window.api.ptyInput(session.id, data)
  }

  const actionClick = (e: MouseEvent<HTMLButtonElement>, action: () => void): void => {
    e.stopPropagation()
    action()
  }

  const split = (direction: SplitDirection): void => {
    splitSession(session.id, direction)
    setSplitOpen(false)
  }

  const onPaneMouseEnter = (): void => {
    if (settingsRef.current.focusFollowsMouse && activeId !== session.id) {
      setActive(session.id)
      terminalRef.current?.focus()
    }
  }

  const onPaneContextMenu = (e: MouseEvent<HTMLDivElement>): void => {
    const term = terminalRef.current
    if (term?.hasSelection()) {
      const selection = term.getSelection()
      if (selection) {
        e.preventDefault()
        window.api.suppressNextContextMenu()
        window.api.writeClipboardText(selection)
        term.clearSelection()
        term.focus()
        return
      }
    }

    // Right-clicking a URL opens it (localhost in the in-app preview, others in
    // the system browser), regardless of the paste-on-right-click setting.
    const url = hoveredUrlRef.current
    if (url && !e.ctrlKey) {
      e.preventDefault()
      window.api.suppressNextContextMenu()
      if (/^https?:\/\//i.test(url)) {
        if (isLocalhostUrl(url)) openPreview(url)
        else window.api.openExternal(url)
      }
      return
    }
    // Ctrl+right-click falls through to the native Cut/Copy/Paste menu.
    if (!settingsRef.current.rightClickPaste || e.ctrlKey) return
    e.preventDefault()
    window.api.suppressNextContextMenu()
    setActive(session.id)
    void window.api.readClipboardText().then((text) => {
      if (text) window.api.ptyInput(session.id, text)
    })
    terminalRef.current?.focus()
  }

  return (
    <div
      ref={paneRef}
      className={`pane ${activeId === session.id ? 'focused' : ''} ${dropActive ? 'pane-drop-target' : ''} ${dragging ? 'pane-dragging' : ''} ${collapsed ? 'pane-collapsed' : ''}`}
      style={{ '--pane-accent': session.accent, display: hidden ? 'none' : undefined } as CSSProperties}
      onMouseDown={focusPane}
      onClick={focusPane}
      onMouseEnter={onPaneMouseEnter}
      onContextMenu={onPaneContextMenu}
      onKeyDown={onPaneKeyDown}
      onPasteCapture={(e) => void onPanePaste(e)}
      onDragOver={onPaneDragOver}
      onDragLeave={onPaneDragLeave}
      onDrop={onPaneDrop}
      tabIndex={0}
    >
      <div
        className="pane-head"
        draggable
        onDragStart={onHeadDragStart}
        onDragEnd={onHeadDragEnd}
        title="Drag to move this terminal"
      >
        <span className="pane-dot" style={{ background: session.accent, color: session.accent }} />
        <span className="pane-name">Terminal {number ?? (terminalNumber || 1)}</span>
        <span className="pane-tag">{session.tag}</span>
        <span className="pane-actions">
          <span className="pane-grp">
          <button className="pane-act" title="New terminal" aria-label="New terminal" onClick={(e) => actionClick(e, () => addSession(session.modelId))}>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M8 3.5v9M3.5 8h9" />
            </svg>
          </button>
          <div className="pane-split" ref={splitRef}>
            <button
              className={`pane-act ${splitOpen ? 'active' : ''}`}
              title="Split — add a terminal up, down, left or right"
              aria-label="Split terminal"
              aria-haspopup="true"
              aria-expanded={splitOpen}
              onClick={(e) => actionClick(e, () => setSplitOpen((v) => !v))}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="3" width="12" height="10" rx="1.5" />
                <line x1="8" y1="3" x2="8" y2="13" />
              </svg>
            </button>
            {splitOpen && (
              <div className="pane-split-pad" role="menu" aria-label="Add terminal in a direction">
                <button className="psp psp-up" role="menuitem" title="Add terminal above" aria-label="Add terminal above" onClick={(e) => actionClick(e, () => split('up'))}>
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 12.5V4M4.5 7.5 8 4l3.5 3.5" /></svg>
                </button>
                <button className="psp psp-left" role="menuitem" title="Add terminal left" aria-label="Add terminal to the left" onClick={(e) => actionClick(e, () => split('left'))}>
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12.5 8H4M7.5 4.5 4 8l3.5 3.5" /></svg>
                </button>
                <span className="psp-core" aria-hidden="true" />
                <button className="psp psp-right" role="menuitem" title="Add terminal right" aria-label="Add terminal to the right" onClick={(e) => actionClick(e, () => split('right'))}>
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 8H12M8.5 4.5 12 8l-3.5 3.5" /></svg>
                </button>
                <button className="psp psp-down" role="menuitem" title="Add terminal below" aria-label="Add terminal below" onClick={(e) => actionClick(e, () => split('down'))}>
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3.5V12M4.5 8.5 8 12l3.5-3.5" /></svg>
                </button>
              </div>
            )}
          </div>
          </span>
          <span className="pane-grp">
          <button
            className={`pane-act ${collapsed ? 'active' : ''}`}
            title={collapsed ? 'Show terminal' : 'Hide terminal'}
            aria-label={collapsed ? 'Show terminal' : 'Hide terminal'}
            aria-pressed={collapsed}
            onClick={(e) => actionClick(e, () => toggleSessionCollapsed(session.id))}
          >
            {collapsed ? (
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M1.5 8S3.8 3.5 8 3.5 14.5 8 14.5 8 12.2 12.5 8 12.5 1.5 8 1.5 8Z" />
                <circle cx="8" cy="8" r="2" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 2.5 14 13.5" />
                <path d="M6.4 4.2A6.6 6.6 0 0 1 8 4c4.2 0 6.5 4 6.5 4a11 11 0 0 1-2 2.3M4 5.6A11 11 0 0 0 1.5 8S3.8 12 8 12c.8 0 1.5-.13 2.1-.34" />
                <path d="M6.6 6.6a2 2 0 0 0 2.8 2.8" />
              </svg>
            )}
          </button>
          <button className="pane-act" title="Send Enter to the shell" aria-label="Send Enter to the shell" onClick={(e) => actionClick(e, () => window.api.ptyInput(session.id, '\r'))}>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M13 3.5v4a2 2 0 0 1-2 2H3.5" />
              <path d="M6 7 3 9.5 6 12" />
            </svg>
          </button>
          <button className="pane-act" title="Close terminal" aria-label="Close terminal" onClick={(e) => actionClick(e, () => removeSession(session.id))}>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 4.5h10M6.5 4.5V3.6a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v.9M4.8 4.5l.55 8a1 1 0 0 0 1 .93h3.3a1 1 0 0 0 1-.93l.55-8M6.8 7v4M9.2 7v4" />
            </svg>
          </button>
          </span>
        </span>
      </div>
      <div
        className="pane-term"
        ref={termRef}
        onMouseDownCapture={(e) => {
          setActive(session.id)
          startPlainTerminalSelection(terminalRef.current, e)
        }}
      >
        {findOpen && searchRef.current && (
          <TerminalFindBar
            search={searchRef.current}
            onClose={() => {
              searchRef.current?.clearDecorations()
              setFindOpen(false)
              terminalRef.current?.focus()
            }}
          />
        )}
      </div>
      {attachmentNotice && (
        <div className="pane-attachment" role="status">
          <span className="pane-attachment-icon" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
            </svg>
          </span>
          <span title={attachmentNotice.name}>{attachmentNotice.name}</span>
        </div>
      )}
    </div>
  )
}
