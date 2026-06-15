import { spawn, type ChildProcess } from 'child_process'
import { homedir } from 'os'
import type { BrowserWindow } from 'electron'
import type { ChatSendPayload } from '../shared/types'

const isWindows = process.platform === 'win32'
const isMac = process.platform === 'darwin'

// The prompt is handed to the CLI through an environment variable rather than
// being interpolated into the command string, so nothing the user types can be
// parsed as shell syntax.
const PROMPT_ENV = 'GENNAL_CHAT_PROMPT'

// Maps a model's base command to the flags that make its CLI run once,
// non-interactively, and print a plain-text answer. Keyed by the first word of
// the model's `command` so registry overrides with extra flags still match.
const HEADLESS_ARGS: Record<string, string[]> = {
  claude: ['-p'],
  // `exec` is codex's non-interactive mode. For a chat panel we want snappy
  // replies, so drop reasoning effort to "low" (medium spends many seconds
  // "thinking" before answering) and skip the git-repo check that otherwise
  // stalls/aborts outside a repo. The bare value `low` isn't valid TOML, so
  // codex falls back to using it as a literal string — which is what we want.
  // `--json` streams structured JSONL events to stdout: we parse those (see
  // parseCodexEvents) to drive a live status line and to pull out a clean final
  // answer, instead of mixing codex's stderr banner/progress into the reply.
  codex: ['exec', '--json', '--skip-git-repo-check', '-c', 'model_reasoning_effort=low'],
  gemini: ['-p']
}

// Each CLI takes image input differently. Codex has a dedicated `-i/--image`
// flag; Claude and Gemini read files referenced in the prompt itself (Gemini via
// `@path` mentions, Claude via its file-reading tools). Custom models fall back
// to listing the paths so the user's own command can pick them up.
function imageArgs(cli: string, images: string[]): string[] {
  if (images.length === 0) return []
  if (cli === 'codex') return images.flatMap((p) => ['-i', p])
  return []
}

// Same flags, but with paths quoted for safe interpolation into a shell command
// string (the fallback path). The fast path passes argv literally and doesn't
// need this.
function imageArgsForShell(cli: string, images: string[]): string[] {
  return imageArgs(cli, images).map((tok) =>
    tok.startsWith('-') ? tok : `"${tok.replace(/"/g, '\\"')}"`
  )
}

function decoratePrompt(cli: string, prompt: string, images: string[]): string {
  if (images.length === 0 || cli === 'codex') return prompt
  const refs =
    cli === 'gemini'
      ? images.map((p) => `@${p}`).join(' ')
      : images.map((p) => `- ${p}`).join('\n')
  const header =
    cli === 'gemini'
      ? 'Attached image(s):'
      : 'Attached image file(s) — please view them:'
  return `${prompt}\n\n${header}\n${refs}`.trim()
}

// Headless runs sometimes never finish: a CLI may enter an agent loop and stall
// on an approval, auth, or tool call that can't be answered non-interactively
// (e.g. Gemini's "[LocalAgentExecutor] Blocked call: Unauthorized", which comes
// from a user's own hooks/wrappers). Without a cap the chat would spin forever,
// so a run that has produced no answer by this point is stopped and reported.
// Kept short so a stuck run fails fast instead of leaving the user waiting.
const CHAT_TIMEOUT_MS = 90_000

interface ChatJob {
  proc: ChildProcess
  timer?: NodeJS.Timeout
}

const jobs = new Map<string, ChatJob>()

function emit(win: BrowserWindow, channel: string, payload: unknown): void {
  if (!win.isDestroyed()) win.webContents.send(channel, payload)
}

function baseCommand(command: string): string {
  return command.trim().split(/\s+/)[0] ?? ''
}

// Split a command string into argv tokens, honouring double quotes so paths
// with spaces (e.g. `python "C:\my app\x.py"`) stay a single argument. Used to
// run a model directly, without a shell.
function tokenize(command: string): string[] {
  const tokens: string[] = []
  const re = /"([^"]*)"|(\S+)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(command)) !== null) {
    tokens.push(match[1] ?? match[2] ?? '')
  }
  return tokens
}

// Turn a single codex `--json` event into either a chunk of the final answer
// (`answer`) or a short human-readable status line (`status`) to show while it
// works. Unknown/irrelevant events return neither.
function describeCodexEvent(evt: Record<string, unknown>): { answer?: string; status?: string } {
  const type = typeof evt.type === 'string' ? evt.type : ''
  const item = (evt.item ?? {}) as Record<string, unknown>
  const itemType = typeof item.type === 'string' ? item.type : ''

  if (type === 'thread.started') return { status: 'Starting…' }
  if (type === 'turn.started') return { status: 'Thinking…' }

  if (type.startsWith('item.')) {
    const text = typeof item.text === 'string' ? item.text : ''
    const command = typeof item.command === 'string' ? item.command : ''
    switch (itemType) {
      case 'agent_message':
        // The model's reply. Only emit on completion so we don't double-print.
        return type === 'item.completed' && text ? { answer: text } : { status: 'Writing reply…' }
      case 'reasoning':
        return { status: 'Reasoning…' }
      case 'command_execution':
        return { status: command ? `Running: ${command}` : 'Running a command…' }
      case 'file_change':
        return { status: 'Editing files…' }
      case 'mcp_tool_call':
        return { status: 'Using a tool…' }
      default:
        return {}
    }
  }
  return {}
}

// Stateful line-buffered parser for codex's `--json` stdout. Feed it raw chunks;
// it calls onAnswer with reply text and onStatus with progress lines. Holds a
// partial trailing line until the rest of it arrives.
function createCodexParser(
  onAnswer: (text: string) => void,
  onStatus: (line: string) => void
): { push: (chunk: string) => void; gotAnswer: () => boolean } {
  let buf = ''
  let answered = false
  const handle = (line: string): void => {
    const trimmed = line.trim()
    if (!trimmed) return
    let evt: Record<string, unknown>
    try {
      evt = JSON.parse(trimmed) as Record<string, unknown>
    } catch {
      return // not a JSON event (stray output) — ignore
    }
    const { answer, status } = describeCodexEvent(evt)
    if (answer) {
      answered = true
      onAnswer(answer)
    }
    if (status) onStatus(status)
  }
  return {
    push: (chunk: string): void => {
      buf += chunk
      let nl: number
      while ((nl = buf.indexOf('\n')) !== -1) {
        handle(buf.slice(0, nl))
        buf = buf.slice(nl + 1)
      }
    },
    gotAnswer: (): boolean => answered
  }
}

/**
 * Builds the shell invocation that runs a model headlessly. `commandPrefix` is
 * everything before the prompt (e.g. `claude -p`, or a custom model's full
 * command like `ollama run llama3`). The prompt is referenced as an environment
 * variable so it stays a single, un-parsed argument on every platform. This is
 * the fallback path for commands that can't be spawned directly (Windows
 * `.cmd`/`.bat` shims, shell builtins).
 */
function buildInvocation(commandPrefix: string): { shell: string; args: string[] } {
  if (isWindows) {
    const ref = `$env:${PROMPT_ENV}`
    const command = `& ${commandPrefix} ${ref}`
    return {
      shell: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-Command', command]
    }
  }

  // Login shell so the user's PATH (nvm/brew/npm globals) is on PATH, matching
  // how the interactive terminals already resolve these CLIs.
  const userShell = process.env.SHELL || (isMac ? '/bin/zsh' : '/bin/bash')
  const ref = `"$${PROMPT_ENV}"`
  const command = `${commandPrefix} ${ref}`
  return { shell: userShell, args: ['-l', '-c', command] }
}

export function startChat(win: BrowserWindow, payload: ChatSendPayload): void {
  const { id, command } = payload
  cancelChat(id)

  const cli = baseCommand(command)

  if (!cli) {
    emit(win, 'chat:exit', { id, code: null, error: 'This model has no command to run.' })
    return
  }

  const images = payload.images ?? []
  // Decorate the prompt (Claude/Gemini read images by path reference) and build
  // any CLI-specific image flags (Codex's `-i`). The decorated prompt flows
  // through both spawn paths via the env var and the literal argv element.
  const prompt = decoratePrompt(cli, payload.prompt, images)
  const imgFlags = imageArgs(cli, images)
  const decorated: ChatSendPayload = { ...payload, prompt }

  // Built-in CLIs get their known print-mode flags; user-added models run their
  // own command with the prompt appended as a trailing argument.
  const headlessArgs = HEADLESS_ARGS[cli]
  const prefixArgs = headlessArgs ? [...headlessArgs, ...imgFlags] : imgFlags
  const imgFlagsShell = imageArgsForShell(cli, images)
  const commandPrefix = headlessArgs
    ? [cli, ...headlessArgs, ...imgFlagsShell].join(' ')
    : [command.trim(), ...imgFlagsShell].join(' ')

  // codex runs with `--json`, so its stdout is a JSONL event stream we parse
  // rather than show verbatim (see spawnChat).
  const codexJson = cli === 'codex' && (headlessArgs?.includes('--json') ?? false)

  // A custom command using shell features (pipes, &&, redirects, substitution)
  // only works through a shell, so skip the fast path for those.
  if (!headlessArgs && /[|&;<>(){}$`]/.test(command)) {
    const { shell, args } = buildInvocation(commandPrefix)
    spawnChat(win, decorated, { file: shell, args, commandPrefix, triedShell: true, codexJson })
    return
  }

  // Fast path: spawn the executable directly with no shell in between, passing
  // the prompt as a literal argv element. A real argument is never parsed as
  // shell syntax, so this is injection-safe, and it avoids the ~hundreds of ms
  // it takes to boot powershell.exe / a login shell on every single message.
  const directArgs = headlessArgs
    ? [...prefixArgs, prompt]
    : [...tokenize(command).slice(1), ...imgFlags, prompt]
  spawnChat(win, decorated, { file: cli, args: directArgs, commandPrefix, triedShell: false, codexJson })
}

interface SpawnAttempt {
  file: string
  args: string[]
  commandPrefix: string
  triedShell: boolean
  codexJson: boolean
}

function spawnChat(win: BrowserWindow, payload: ChatSendPayload, attempt: SpawnAttempt): void {
  const { id, prompt, cwd } = payload
  const cli = baseCommand(payload.command)

  // A `.cmd`/`.bat`/shell-builtin couldn't be found directly — retry through the
  // platform shell, which resolves PATH the same way the interactive terminals do.
  const fallbackToShell = (): void => {
    const { shell, args } = buildInvocation(attempt.commandPrefix)
    spawnChat(win, payload, {
      file: shell,
      args,
      commandPrefix: attempt.commandPrefix,
      triedShell: true,
      codexJson: attempt.codexJson
    })
  }

  let proc: ChildProcess
  try {
    proc = spawn(attempt.file, attempt.args, {
      cwd: cwd || process.cwd() || homedir(),
      env: { ...process.env, [PROMPT_ENV]: prompt },
      windowsHide: true,
      // No stdin: `codex exec` treats an open, piped stdin as "more input is
      // coming" and blocks on EOF forever ("Reading additional input from
      // stdin…"). Giving it no stdin lets it run from the prompt argument alone.
      stdio: ['ignore', 'pipe', 'pipe']
    })
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (!attempt.triedShell && (code === 'ENOENT' || code === 'EINVAL')) {
      fallbackToShell()
      return
    }
    emit(win, 'chat:exit', { id, code: null, error: (err as Error).message })
    return
  }

  const job: ChatJob = { proc }
  jobs.set(id, job)

  const clearTimer = (): void => {
    if (job.timer) {
      clearTimeout(job.timer)
      job.timer = undefined
    }
  }

  // Keep a short tail of stderr so a timed-out run can report what it was last
  // doing (often the blocked call that caused the stall).
  let stderrTail = ''
  let sawStdout = false

  // codex `--json`: its stdout is a JSONL event stream. Parse it into a clean
  // answer (forwarded as stdout) and short status lines (forwarded as stderr,
  // which the renderer shows as live progress). Its real stderr is the noisy
  // banner ("Reading additional input from stdin…", version header, the echoed
  // transcript) so we keep it only for timeout diagnostics and don't forward it.
  const codexParser = attempt.codexJson
    ? createCodexParser(
        (text) => {
          sawStdout = true
          emit(win, 'chat:data', { id, stream: 'stdout', chunk: text })
        },
        (line) => emit(win, 'chat:data', { id, stream: 'stderr', chunk: `${line}\n` })
      )
    : null

  job.timer = setTimeout(() => {
    if (jobs.get(id)?.proc !== proc) return
    try {
      proc.kill()
    } catch {
      /* already gone */
    }
    jobs.delete(id)
    // If the model has been streaming an answer, let it stand instead of erroring.
    if (sawStdout) {
      emit(win, 'chat:exit', { id, code: null })
      return
    }
    const lastLines = stderrTail.split('\n').filter((l) => l.trim()).slice(-2).join('\n')
    const detail = lastLines ? `\n\nLast activity:\n${lastLines}` : ''
    emit(win, 'chat:exit', {
      id,
      code: null,
      error:
        `'${cli}' did not respond within ${Math.round(CHAT_TIMEOUT_MS / 1000)}s and was stopped. ` +
        `It may be stuck on an approval, sign-in, or tool call it can't complete in this ` +
        `non-interactive chat.${detail}`
    })
  }, CHAT_TIMEOUT_MS)

  proc.stdout?.on('data', (d: Buffer) => {
    const chunk = d.toString()
    if (codexParser) {
      codexParser.push(chunk)
      return
    }
    sawStdout = true
    emit(win, 'chat:data', { id, stream: 'stdout', chunk })
  })
  proc.stderr?.on('data', (d: Buffer) => {
    const chunk = d.toString()
    stderrTail = (stderrTail + chunk).slice(-2000)
    // For codex, progress comes from the parsed JSON events instead of the raw
    // stderr banner, so don't forward it to the chat bubble.
    if (codexParser) return
    emit(win, 'chat:data', { id, stream: 'stderr', chunk })
  })
  proc.on('error', (err: NodeJS.ErrnoException) => {
    if (jobs.get(id)?.proc !== proc) return
    clearTimer()
    // The direct spawn couldn't locate the executable (e.g. an npm `.cmd` shim
    // on Windows) — fall back to running it through the shell before giving up.
    if (!attempt.triedShell && (err.code === 'ENOENT' || err.code === 'EINVAL')) {
      jobs.delete(id)
      fallbackToShell()
      return
    }
    const hint = err.code === 'ENOENT' ? ` — is '${cli}' installed and on PATH?` : ''
    emit(win, 'chat:exit', { id, code: null, error: `${err.message}${hint}` })
    jobs.delete(id)
  })
  proc.on('close', (code) => {
    if (jobs.get(id)?.proc !== proc) return
    clearTimer()
    // codex finished successfully but emitted no agent_message (e.g. it only ran
    // commands) — surface a gentle note rather than letting the renderer treat a
    // leftover status line as the answer/an error.
    if (codexParser && code === 0 && !codexParser.gotAnswer()) {
      emit(win, 'chat:data', { id, stream: 'stdout', chunk: 'Done (no message returned).' })
    }
    emit(win, 'chat:exit', { id, code })
    jobs.delete(id)
  })
}

export function cancelChat(id: string): void {
  const job = jobs.get(id)
  if (!job) return
  if (job.timer) clearTimeout(job.timer)
  try {
    job.proc.kill()
  } catch {
    /* already gone */
  }
  jobs.delete(id)
}

export function cancelAllChats(): void {
  for (const id of [...jobs.keys()]) cancelChat(id)
}
