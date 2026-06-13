import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useStore } from '../store'

// A single dedicated shell that lives in the right panel's TERMINAL tab.
// Reuses the same PTY bridge as the model panes; an empty command spawns a
// plain shell (PowerShell on Windows, $SHELL/bash elsewhere).
const PANEL_TERM_ID = 'gennal-panel-terminal'

function isTerminalReport(data: string): boolean {
  return /^\x1b\[\?1;2c$/.test(data) || /^\x1b\[\?6c$/.test(data) || /^\x1b\[\d+;\d+R$/.test(data)
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
  const terminalSettings = useStore((s) => s.terminalSettings)
  // Bumping this re-runs the lifecycle effect, restarting the shell.
  const [epoch, setEpoch] = useState(0)
  const [exited, setExited] = useState(false)

  useEffect(() => {
    if (!hostRef.current) return
    const term = new Terminal({
      fontFamily: terminalSettings.fontFamily,
      fontSize: terminalSettings.fontSize,
      cursorBlink: terminalSettings.cursorBlink,
      scrollback: terminalSettings.scrollback,
      theme: {
        background: '#0c0e16',
        foreground: '#d7dae6',
        cursor: '#7c5cff',
        selectionBackground: '#7c5cff44'
      }
    })
    terminalRef.current = term

    const fit = new FitAddon()
    fitRef.current = fit
    term.loadAddon(fit)
    term.open(hostRef.current)

    setExited(false)
    window.api.ptyCreate({ id: PANEL_TERM_ID, command: '', cwd })

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
      window.api.ptyKill(PANEL_TERM_ID)
      term.dispose()
      terminalRef.current = null
      fitRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch])

  // Live-apply terminal preference changes (font, cursor, scrollback).
  useEffect(() => {
    const term = terminalRef.current
    if (!term) return
    term.options.fontFamily = terminalSettings.fontFamily
    term.options.fontSize = terminalSettings.fontSize
    term.options.cursorBlink = terminalSettings.cursorBlink
    term.options.scrollback = terminalSettings.scrollback
  }, [terminalSettings])

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
      <div className="rp-term-host" ref={hostRef} onMouseDown={() => terminalRef.current?.focus()} />
    </div>
  )
}
