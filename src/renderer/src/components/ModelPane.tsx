import { useEffect, useRef, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useStore, type Session } from '../store'

function isTerminalReport(data: string): boolean {
  return /^\x1b\[\?1;2c$/.test(data) || /^\x1b\[\?6c$/.test(data) || /^\x1b\[\d+;\d+R$/.test(data)
}

interface KeyLikeEvent {
  altKey: boolean
  ctrlKey: boolean
  key: string
  metaKey: boolean
}

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

export default function ModelPane({ session }: { session: Session }): JSX.Element {
  const paneRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const setStatus = useStore((s) => s.setStatus)
  const removeSession = useStore((s) => s.removeSession)
  const setActive = useStore((s) => s.setActive)
  const activeId = useStore((s) => s.activeId)
  const sessions = useStore((s) => s.sessions)
  const addSession = useStore((s) => s.addSession)
  const setGrid = useStore((s) => s.setGrid)
  const terminalNumber = sessions.findIndex((s) => s.id === session.id) + 1

  useEffect(() => {
    if (!termRef.current) return
    const term = new Terminal({
      fontFamily: 'JetBrains Mono, Consolas, monospace',
      fontSize: 12.5,
      cursorBlink: true,
      theme: {
        background: '#0c0e16',
        foreground: '#d7dae6',
        cursor: session.accent,
        selectionBackground: '#7c5cff44'
      }
    })
    terminalRef.current = term

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(termRef.current)
    fit.fit()
    term.focus()

    const { id, command, cwd } = session
    window.api.ptyCreate({ id, command, cwd })
    setStatus(id, 'running')

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
      window.api.ptyKill(id)
      term.dispose()
      terminalRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])

  useEffect(() => {
    if (activeId === session.id) {
      requestAnimationFrame(() => terminalRef.current?.focus())
    }
  }, [activeId, session.id])

  const focusPane = (): void => {
    setActive(session.id)
    paneRef.current?.focus()
    terminalRef.current?.focus()
  }

  const onPaneKeyDown = (e: ReactKeyboardEvent): void => {
    const target = e.target as HTMLElement
    if (target.closest('.xterm')) return

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

  return (
    <div
      ref={paneRef}
      className={`pane ${activeId === session.id ? 'focused' : ''}`}
      style={{ borderColor: `${session.accent}88`, '--pane-accent': session.accent } as CSSProperties}
      onMouseDown={focusPane}
      onClick={focusPane}
      onKeyDown={onPaneKeyDown}
      tabIndex={0}
    >
      <div className="pane-head">
        <span className="pane-dot" style={{ background: session.accent, color: session.accent }} />
        <span className="pane-name">Terminal {terminalNumber || 1}</span>
        <span className="pane-tag">{session.tag}</span>
        <span className="pane-actions">
          <button title="New terminal" onClick={(e) => actionClick(e, () => addSession(session.modelId))}>+</button>
          <button title="Split columns" onClick={(e) => actionClick(e, () => setGrid(1, 2))}>
            <span className="split-icon split-vertical" />
          </button>
          <button title="Split grid" onClick={(e) => actionClick(e, () => setGrid(2, 2))}>
            <span className="split-icon split-grid" />
          </button>
          <button title="Close terminal" onClick={(e) => actionClick(e, () => removeSession(session.id))}>
            <span className="trash-icon" />
          </button>
          <button title="More options" onClick={(e) => actionClick(e, () => window.api.ptyInput(session.id, '\r'))}>
            <span className="more-icon" />
          </button>
        </span>
      </div>
      <div className="pane-term" ref={termRef} onMouseDown={focusPane} />
    </div>
  )
}
