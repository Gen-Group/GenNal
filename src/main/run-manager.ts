import { spawn, type ChildProcess } from 'child_process'
import { basename, dirname, extname, join } from 'path'
import type { BrowserWindow } from 'electron'
import type { RunStartPayload } from '../shared/types'

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

  const { command, args } = runner(payload.filePath)
  const cwd = payload.cwd ?? dirname(payload.filePath)
  emit(win, 'run:data', { stream: 'system', chunk: `$ ${command} ${args.join(' ')}\n` })

  let child: ChildProcess
  try {
    child = spawn(command, args, { cwd, env: process.env, windowsHide: true })
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
