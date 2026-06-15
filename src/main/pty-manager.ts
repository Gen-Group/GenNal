import * as pty from 'node-pty'
import { homedir } from 'os'
import type { BrowserWindow } from 'electron'
import type { PtyCreatePayload } from '../shared/types'

const isWindows = process.platform === 'win32'
const isMac = process.platform === 'darwin'

const SHELL = isWindows
  ? 'powershell.exe'
  : process.env.SHELL || (isMac ? '/bin/zsh' : '/bin/bash')

// Spawn the shell as a login + interactive shell on macOS/Linux so it sources
// the user's profile (.zprofile/.zshrc, .bash_profile/.bashrc). A GUI Electron
// app launched from Finder/Dock inherits only a minimal PATH, so without this
// the user's CLIs (claude, codex, gemini installed via npm/brew/nvm) are not on
// PATH and never launch, and the shell shows no themed prompt.
const SHELL_ARGS = isWindows ? [] : ['-l', '-i']

interface Session {
  proc: pty.IPty
}

const sessions = new Map<string, Session>()

export function createSession(win: BrowserWindow, payload: PtyCreatePayload): void {
  const { id, cwd, command } = payload
  if (sessions.has(id)) return

  const env = { ...(process.env as Record<string, string>) }

  let proc: pty.IPty
  try {
    proc = pty.spawn(SHELL, SHELL_ARGS, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: cwd || process.cwd() || homedir(),
      env,
      useConptyDll: isWindows
    })
  } catch (err) {
    win.webContents.send('pty:exit', { id, code: -1 })
    return
  }

  sessions.set(id, { proc })

  proc.onData((data) => {
    if (!win.isDestroyed()) win.webContents.send('pty:data', { id, data })
  })

  proc.onExit(({ exitCode }) => {
    // Only act if this proc still owns the slot. Under React StrictMode the
    // effect mounts twice: a short-lived session is created and killed, then a
    // fresh one takes the same id. The first proc's delayed exit must not evict
    // its successor from the map (which would silently drop all input) nor emit
    // a spurious 'stopped' for a session that is actually alive.
    if (sessions.get(id)?.proc !== proc) return
    if (!win.isDestroyed()) win.webContents.send('pty:exit', { id, code: exitCode })
    sessions.delete(id)
  })

  // Launch the selected model's CLI once the shell is ready.
  if (command && command.trim().length > 0) {
    setTimeout(() => {
      try {
        proc.write(`${command}\r`)
      } catch {
        /* session may have exited */
      }
    }, 600)
  }
}

export function writeSession(id: string, data: string): void {
  sessions.get(id)?.proc.write(data)
}

export function resizeSession(id: string, cols: number, rows: number): void {
  try {
    sessions.get(id)?.proc.resize(Math.max(cols, 1), Math.max(rows, 1))
  } catch {
    /* ignore resize race */
  }
}

export function killSession(id: string): void {
  const s = sessions.get(id)
  if (s) {
    try {
      s.proc.kill()
    } catch {
      /* already gone */
    }
    sessions.delete(id)
  }
}

export function killAll(): void {
  for (const s of sessions.values()) {
    try {
      s.proc.kill()
    } catch {
      /* ignore */
    }
  }
  sessions.clear()
}
