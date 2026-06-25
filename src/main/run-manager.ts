import { spawn, type ChildProcess } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { basename, dirname, extname, join } from 'path'
import type { BrowserWindow } from 'electron'
import type { PackageManager, ProjectScripts, RunStartPayload } from '../shared/types'

type Runner = (file: string) => { command: string; args: string[] }

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function cRunner(compiler: string): Runner {
  return (file) => {
    const out = join(dirname(file), `${basename(file, extname(file))}.exe`)
    const script = [
      `$source = ${psQuote(file)}`,
      `$out = ${psQuote(out)}`,
      `$compiler = Get-Command ${psQuote(compiler)} -ErrorAction SilentlyContinue`,
      'if (-not $compiler) { throw "' + compiler + ' is not installed or not on PATH." }',
      '& $compiler.Source $source -o $out',
      'if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
      '& $out'
    ].join('; ')

    return {
      command: 'powershell.exe',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script]
    }
  }
}

// Map a source extension to the executable that runs it. Each interpreter must
// be on PATH; a missing one surfaces as a friendly 'not found' line, not a crash.
const RUNNERS: Record<string, Runner> = {
  '.js': (f) => ({ command: 'node', args: [f] }),
  '.mjs': (f) => ({ command: 'node', args: [f] }),
  '.cjs': (f) => ({ command: 'node', args: [f] }),
  '.c': cRunner('gcc'),
  '.cc': cRunner('g++'),
  '.cpp': cRunner('g++'),
  '.cxx': cRunner('g++'),
  '.py': (f) => ({ command: 'python', args: [f] }),
  '.rb': (f) => ({ command: 'ruby', args: [f] }),
  '.go': (f) => ({ command: 'go', args: ['run', f] }),
  '.dart': (f) => ({ command: 'dart', args: ['run', f] }),
  '.swift': (f) => ({ command: 'swift', args: [f] }),
  '.sh': (f) => ({ command: 'bash', args: [f] }),
  '.ps1': (f) => ({
    command: 'powershell.exe',
    args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', f]
  })
}

let current: ChildProcess | null = null

function emit(win: BrowserWindow, channel: string, payload: unknown): void {
  if (!win.isDestroyed()) win.webContents.send(channel, payload)
}

export function startRun(win: BrowserWindow, payload: RunStartPayload): void {
  stopRun()

  // A run is either an explicit command (project scripts) or a source file whose
  // interpreter we pick from its extension.
  let command: string
  let args: string[]
  let cwd: string | undefined
  let useShell = false

  if (payload.command) {
    command = payload.command
    args = payload.args ?? []
    cwd = payload.cwd
    // Project scripts go through the shell so `npm`/`pnpm`/`bun` resolve to their
    // platform launcher (e.g. npm.cmd on Windows) without us guessing the suffix.
    useShell = true
  } else if (payload.filePath) {
    const ext = extname(payload.filePath).toLowerCase()
    const runner = RUNNERS[ext]
    if (!runner) {
      emit(win, 'run:data', {
        stream: 'system',
        chunk: `No runner configured for ${ext || 'this file type'}.\n`
      })
      emit(win, 'run:exit', { code: null })
      return
    }
    ;({ command, args } = runner(payload.filePath))
    cwd = payload.cwd ?? dirname(payload.filePath)
  } else {
    emit(win, 'run:data', { stream: 'system', chunk: 'Nothing to run.\n' })
    emit(win, 'run:exit', { code: null })
    return
  }

  const display = payload.label ?? `${command} ${args.join(' ')}`.trim()
  emit(win, 'run:data', { stream: 'system', chunk: `$ ${display}\n` })

  let child: ChildProcess
  try {
    child = spawn(command, args, { cwd, env: process.env, windowsHide: true, shell: useShell })
  } catch (err) {
    emit(win, 'run:data', { stream: 'system', chunk: `Failed to start: ${(err as Error).message}\n` })
    emit(win, 'run:exit', { code: null })
    return
  }
  current = child

  let finished = false
  const finish = (code: number | null, signal?: string): void => {
    if (finished) return
    finished = true
    if (current === child) current = null
    emit(win, 'run:exit', { code, signal })
  }

  child.stdout?.on('data', (d: Buffer) => emit(win, 'run:data', { stream: 'stdout', chunk: d.toString() }))
  child.stderr?.on('data', (d: Buffer) => emit(win, 'run:data', { stream: 'stderr', chunk: d.toString() }))
  child.on('error', (err: NodeJS.ErrnoException) => {
    const hint = err.code === 'ENOENT' ? ` — is '${command}' installed and on PATH?` : ''
    emit(win, 'run:data', { stream: 'system', chunk: `${command}: ${err.message}${hint}\n` })
    finish(null)
  })
  child.on('close', (code, signal) => finish(code, signal ?? undefined))
}

/** Pick the package manager from the project's lockfile, defaulting to npm. */
function detectManager(cwd: string): PackageManager {
  if (existsSync(join(cwd, 'bun.lockb')) || existsSync(join(cwd, 'bun.lock'))) return 'bun'
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn'
  return 'npm'
}

/** Read the project's package.json scripts (empty list when there is none). */
export function readProjectScripts(cwd: string): ProjectScripts {
  const manager = detectManager(cwd)
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) as {
      scripts?: Record<string, unknown>
    }
    const scripts = Object.entries(pkg.scripts ?? {})
      .filter(([, value]) => typeof value === 'string')
      .map(([name, value]) => ({ name, command: String(value) }))
    return { manager, scripts }
  } catch {
    return { manager, scripts: [] }
  }
}

export function stopRun(): void {
  if (current) {
    try {
      current.kill()
    } catch {
      /* already gone */
    }
    current = null
  }
}
