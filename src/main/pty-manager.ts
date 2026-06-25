import * as pty from 'node-pty'
import { homedir } from 'os'
import { existsSync, statSync, chmodSync } from 'fs'
import { dirname, join } from 'path'
import type { BrowserWindow } from 'electron'
import type { PtyCreatePayload } from '../shared/types'

const isWindows = process.platform === 'win32'
const isMac = process.platform === 'darwin'

// node-pty on macOS/Linux shells out to a tiny `spawn-helper` binary to acquire
// the controlling tty. When the app is packaged (asar-unpacked) the executable
// bit on that helper can be lost, so pty.spawn fails with EACCES and every
// terminal pane comes up blank/dead. Re-assert +x once before the first spawn.
let helperChecked = false
function ensureSpawnHelperExecutable(): void {
  if (isWindows || helperChecked) return
  helperChecked = true
  try {
    // require.resolve works at runtime in the CJS-bundled main and follows
    // Electron's asar-unpacked redirection to the real on-disk module.
    const ptyRoot = dirname(dirname(require.resolve('node-pty')))
    const helper = join(ptyRoot, 'build', 'Release', 'spawn-helper')
    if (existsSync(helper)) chmodSync(helper, 0o755)
  } catch {
    /* best effort — surfaced as a normal spawn error below if it still fails */
  }
}

// Pick a working directory that actually exists. A persisted cwd can be stale
// (deleted folder) or invalid for this OS (a Windows-style path on macOS); a
// non-existent cwd makes pty.spawn throw, which is a common "dead terminal".
function resolveCwd(cwd?: string): string {
  try {
    if (cwd && statSync(cwd).isDirectory()) return cwd
  } catch {
    /* fall through to a safe default */
  }
  // No (or invalid) cwd means no project is open: open in the user's home
  // directory like a normal local terminal, not the app's install dir
  // (process.cwd()), which is meaningless to the user.
  return homedir()
}

const SHELL = isWindows
  ? 'powershell.exe'
  : process.env.SHELL || (isMac ? '/bin/zsh' : '/bin/bash')

// Spawn the shell as a login + interactive shell on macOS/Linux so it sources
// the user's profile (.zprofile/.zshrc, .bash_profile/.bashrc). A GUI Electron
// app launched from Finder/Dock inherits only a minimal PATH, so without this
// the user's CLIs (claude, codex, gemini installed via npm/brew/nvm) are not on
// PATH and never launch, and the shell shows no themed prompt.
const SHELL_ARGS = isWindows ? [] : ['-l', '-i']

// Resolve a Windows-shell preference to an executable + args. Falls back to the
// default shell on non-Windows or unknown values; missing binaries (e.g. Git
// Bash / WSL not installed) surface as a normal pty exit the renderer reports.
function resolveShell(shell?: string): { file: string; args: string[] } {
  if (!isWindows || !shell || shell === 'powershell') return { file: SHELL, args: SHELL_ARGS }
  switch (shell) {
    case 'cmd':
      return { file: 'cmd.exe', args: [] }
    case 'wsl':
      return { file: 'wsl.exe', args: [] }
    case 'gitbash': {
      const candidates = [
        `${process.env.ProgramFiles ?? 'C:\\Program Files'}\\Git\\bin\\bash.exe`,
        `${process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'}\\Git\\bin\\bash.exe`,
        `${process.env.LOCALAPPDATA ?? ''}\\Programs\\Git\\bin\\bash.exe`
      ]
      const found = candidates.find((p) => p && existsSync(p))
      return { file: found ?? 'bash.exe', args: ['-i', '-l'] }
    }
    default:
      return { file: SHELL, args: SHELL_ARGS }
  }
}

interface Session {
  proc: pty.IPty
}

const sessions = new Map<string, Session>()

// Extra subscribers (beyond the owning BrowserWindow) that want a copy of every
// pane's output/exit — currently the mobile bridge, which mirrors terminals to a
// paired phone. Kept separate from the window send so desktop behaviour is
// unchanged whether or not anything is listening.
type PtyDataListener = (id: string, data: string) => void
type PtyExitListener = (id: string, code: number) => void
const dataListeners = new Set<PtyDataListener>()
const exitListeners = new Set<PtyExitListener>()

export function addPtyListeners(onData: PtyDataListener, onExit: PtyExitListener): () => void {
  dataListeners.add(onData)
  exitListeners.add(onExit)
  return () => {
    dataListeners.delete(onData)
    exitListeners.delete(onExit)
  }
}

/** Ids of the live terminal sessions, so the bridge knows which panes exist. */
export function listSessionIds(): string[] {
  return [...sessions.keys()]
}

export function hasSession(id: string): boolean {
  return sessions.has(id)
}

export function createSession(win: BrowserWindow, payload: PtyCreatePayload): void {
  const { id, cwd, command, shell } = payload
  if (sessions.has(id)) return

  const env = { ...(process.env as Record<string, string>) }
  const { file: shellFile, args: shellArgs } = resolveShell(shell)
  ensureSpawnHelperExecutable()

  let proc: pty.IPty
  try {
    proc = pty.spawn(shellFile, shellArgs, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: resolveCwd(cwd),
      env,
      useConptyDll: isWindows
    })
  } catch (err) {
    // Make the failure visible instead of leaving a blank pane: write the reason
    // into the terminal, then report the exit so the status flips to 'stopped'.
    if (!win.isDestroyed()) {
      const reason = err instanceof Error ? err.message : String(err)
      win.webContents.send('pty:data', {
        id,
        data: `\r\n\x1b[31mFailed to start shell (${shellFile}): ${reason}\x1b[0m\r\n`
      })
      win.webContents.send('pty:exit', { id, code: -1 })
    }
    return
  }

  sessions.set(id, { proc })

  proc.onData((data) => {
    if (!win.isDestroyed()) win.webContents.send('pty:data', { id, data })
    for (const listener of dataListeners) listener(id, data)
  })

  proc.onExit(({ exitCode }) => {
    // Only act if this proc still owns the slot. Under React StrictMode the
    // effect mounts twice: a short-lived session is created and killed, then a
    // fresh one takes the same id. The first proc's delayed exit must not evict
    // its successor from the map (which would silently drop all input) nor emit
    // a spurious 'stopped' for a session that is actually alive.
    if (sessions.get(id)?.proc !== proc) return
    if (!win.isDestroyed()) win.webContents.send('pty:exit', { id, code: exitCode })
    for (const listener of exitListeners) listener(id, exitCode)
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
