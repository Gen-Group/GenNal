import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent
} from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import { useStore, scrollbackLines, windowsShellCommand, activeProjectPath } from '../store'
import { isLocalhostUrl } from '../preview-links'
import TerminalFindBar from './TerminalFindBar'
import { getTerminalTheme } from '../theme-colors'
import { startPlainTerminalSelection } from '../terminal-selection'

// A single dedicated shell that lives in the right panel's TERMINAL tab.
// Reuses the same PTY bridge as the model panes; an empty command spawns a
// plain shell (PowerShell on Windows, $SHELL/bash elsewhere).
const PANEL_TERM_ID = 'gennal-panel-terminal'

interface AttachmentNotice {
  name: string
}

type DroppedFile = File & { path?: string }

function isTerminalReport(data: string): boolean {
  return /^\x1b\[\?1;2c$/.test(data) || /^\x1b\[\?6c$/.test(data) || /^\x1b\[\d+;\d+R$/.test(data)
}

function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)$/i.test(path)
}

function quotePath(path: string): string {
  return `"${path.replace(/"/g, '\\"')}"`
}

export default function PanelTerminal({
  active,
  cwd
}: {
  active: boolean
  cwd?: string
}): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const searchRef = useRef<SearchAddon | null>(null)
  const [findOpen, setFindOpen] = useState(false)
  const noticeTimerRef = useRef<number | null>(null)
  // Stable hook to the latest paste handler for the lifecycle-keyed effect, plus
  // a guard against the same paste running twice (keybinding + DOM event).
  const pasteRef = useRef<() => void>(() => {})
  const lastPasteRef = useRef(0)
  // URL currently under the mouse, so a right-click can open it in the preview.
  const hoveredUrlRef = useRef<string | null>(null)
  const terminalSettings = useStore((s) => s.terminalSettings)
  const theme = useStore((s) => s.theme)
  const settingsRef = useRef(terminalSettings)
  useEffect(() => {
    settingsRef.current = terminalSettings
  }, [terminalSettings])
  // Bumping this re-runs the lifecycle effect, restarting the shell.
  const [epoch, setEpoch] = useState(0)
  const [exited, setExited] = useState(false)
  const [attachmentNotice, setAttachmentNotice] = useState<AttachmentNotice | null>(null)

  useEffect(() => {
    if (!hostRef.current) return
    const term = new Terminal({
      fontFamily: terminalSettings.fontFamily,
      fontSize: terminalSettings.fontSize,
      cursorBlink: terminalSettings.cursorBlink,
      scrollback: scrollbackLines(terminalSettings),
      wordSeparator: terminalSettings.wordSeparators,
      theme: getTerminalTheme()
    })
    terminalRef.current = term

    const fit = new FitAddon()
    fitRef.current = fit
    term.loadAddon(fit)

    const search = new SearchAddon()
    term.loadAddon(search)
    searchRef.current = search

    // Make URLs clickable: localhost dev servers open in the in-app preview,
    // everything else in the system browser. Track the hovered URL so a
    // right-click can open it too.
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

    term.open(hostRef.current)

    // xterm has no built-in copy/paste: copy the selection on Ctrl/Cmd+C (when
    // text is selected) or Ctrl/Cmd+Shift+C, and paste on Ctrl/Cmd+V. Without the
    // V case, xterm sends the raw control char ^V (0x16) to the pty instead of
    // pasting, so nothing could be pasted.
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true
      const mod = window.api.isMac ? event.metaKey : event.ctrlKey
      const isC = event.key === 'c' || event.key === 'C'
      const isV = event.key === 'v' || event.key === 'V'
      const isF = event.key === 'f' || event.key === 'F'
      if (mod && isC && (event.shiftKey || term.hasSelection())) {
        const selection = term.getSelection()
        if (selection) {
          window.api.writeClipboardText(selection)
          term.clearSelection()
          return false
        }
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

    setExited(false)
    window.api.ptyCreate({
      id: PANEL_TERM_ID,
      command: '',
      cwd,
      shell: windowsShellCommand(terminalSettings.windowsShell)
    })

    const offData = window.api.onPtyData((d) => {
      if (d.id === PANEL_TERM_ID) term.write(d.data)
    })
    const offExit = window.api.onPtyExit((d) => {
      if (d.id !== PANEL_TERM_ID) return
      setExited(true)
      term.write('\r\n\x1b[2m[shell exited — press Restart to start a new one]\x1b[0m\r\n')
    })
    const onInput = term.onData((data) => {
      if (isTerminalReport(data)) return
      window.api.ptyInput(PANEL_TERM_ID, data)
    })

    const resize = (): void => {
      const el = hostRef.current
      if (!el || el.clientWidth === 0 || el.clientHeight === 0) return
      try {
        fit.fit()
        window.api.ptyResize(PANEL_TERM_ID, term.cols, term.rows)
      } catch {
        /* ignore resize race */
      }
    }
    const ro = new ResizeObserver(resize)
    ro.observe(hostRef.current)
    requestAnimationFrame(resize)

    return () => {
      ro.disconnect()
      offData()
      offExit()
      onInput.dispose()
      onSelection.dispose()
      window.api.ptyKill(PANEL_TERM_ID)
      term.dispose()
      terminalRef.current = null
      fitRef.current = null
      searchRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch])

  // Live-apply terminal preference changes (font, cursor, scrollback, words).
  useEffect(() => {
    const term = terminalRef.current
    if (!term) return
    term.options.fontFamily = terminalSettings.fontFamily
    term.options.fontSize = terminalSettings.fontSize
    term.options.cursorBlink = terminalSettings.cursorBlink
    term.options.scrollback = scrollbackLines(terminalSettings)
    term.options.wordSeparator = terminalSettings.wordSeparators
  }, [terminalSettings])

  // Re-theme the live terminal on app theme change (no recreate → pty survives).
  useEffect(() => {
    const term = terminalRef.current
    if (term) term.options.theme = getTerminalTheme()
  }, [theme])

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
    }
  }, [])

  const showAttachmentNotice = (notice: AttachmentNotice): void => {
    setAttachmentNotice(notice)
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = window.setTimeout(() => {
      setAttachmentNotice(null)
      noticeTimerRef.current = null
    }, 3200)
  }

  const insertAttachmentPath = (path: string): void => {
    window.api.ptyInput(PANEL_TERM_ID, quotePath(path))
    terminalRef.current?.focus()
  }

  const attachClipboardImage = async (): Promise<void> => {
    try {
      const attachment = await window.api.saveClipboardImage(
        activeProjectPath(useStore.getState().workspace)
      )
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

  // Explicit paste used by the Ctrl/Cmd+V keybinding.
  const pasteIntoTerminal = (): void => {
    if (!claimPaste()) return
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

  const onPaste = (e: ReactClipboardEvent<HTMLDivElement>): void => {
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
      terminalRef.current?.paste(text)
      terminalRef.current?.focus()
      return
    }
    // No plain text — the only useful payload is a clipboard image. Cancel the
    // default so a raw bitmap (Windows screenshot) doesn't leak into the shell,
    // and attach it via the OS clipboard instead.
    e.preventDefault()
    e.stopPropagation()
    void attachClipboardImage()
  }

  const onDrop = (e: ReactDragEvent<HTMLDivElement>): void => {
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

  const onDragOver = (e: ReactDragEvent<HTMLDivElement>): void => {
    const hasFile = Array.from(e.dataTransfer.items).some((item) => item.kind === 'file')
    if (!hasFile) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const onContextMenu = (e: ReactMouseEvent<HTMLDivElement>): void => {
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
    // the system browser).
    const url = hoveredUrlRef.current
    if (url && !e.ctrlKey) {
      e.preventDefault()
      window.api.suppressNextContextMenu()
      if (/^https?:\/\//i.test(url)) {
        if (isLocalhostUrl(url)) useStore.getState().openPreview(url)
        else window.api.openExternal(url)
      }
      return
    }
    // Ctrl+right-click falls through to the native Cut/Copy/Paste menu.
    if (!settingsRef.current.rightClickPaste || e.ctrlKey) return
    e.preventDefault()
    window.api.suppressNextContextMenu()
    void window.api.readClipboardText().then((text) => {
      if (text) window.api.ptyInput(PANEL_TERM_ID, text)
    })
    terminalRef.current?.focus()
  }

  // xterm can't measure while hidden, so re-fit and focus when the tab opens.
  useEffect(() => {
    if (!active) return
    requestAnimationFrame(() => {
      const term = terminalRef.current
      const fit = fitRef.current
      const el = hostRef.current
      if (!term || !fit || !el || el.clientWidth === 0) return
      try {
        fit.fit()
        window.api.ptyResize(PANEL_TERM_ID, term.cols, term.rows)
      } catch {
        /* ignore */
      }
      term.focus()
    })
  }, [active])

  return (
    <div className={`rp-terminal${active ? '' : ' hidden'}`}>
      <div className="rp-output-bar">
        <span className={`run-status ${exited ? '' : 'on'}`}>{exited ? 'Exited' : 'Shell'}</span>
        <span className="file-path-label" title={cwd ?? 'home'}>
          {cwd ?? '~'}
        </span>
        <button className="grow" onClick={() => terminalRef.current?.clear()}>
          Clear
        </button>
        <button onClick={() => setEpoch((n) => n + 1)}>Restart</button>
      </div>
      <div
        className="rp-term-host"
        ref={hostRef}
        onMouseDownCapture={(e) => startPlainTerminalSelection(terminalRef.current, e)}
        onPasteCapture={onPaste}
        onContextMenu={onContextMenu}
        onDragOver={onDragOver}
        onDrop={onDrop}
      />
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
      {attachmentNotice && (
        <div className="rp-attachment" role="status">
          <span className="rp-attachment-icon" aria-hidden="true">
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
