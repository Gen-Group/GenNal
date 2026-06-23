import { homedir } from 'os'
import { join } from 'path'
import { readdir, stat } from 'fs/promises'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import type { AgentSessionAgent, AgentSessionHistory, AgentSessionSummary } from '../shared/types'

/**
 * Builds the "Agent Session History" by summarizing the conversation logs that
 * the Codex and Claude CLIs write under the user's home directory. Everything is
 * best-effort and read-only: missing dirs, unreadable files, and malformed lines
 * degrade to partial data instead of throwing. We never read credential stores.
 *
 *   Codex:  ~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-*.jsonl  (one file/session)
 *   Claude: ~/.claude/projects/<encoded-cwd>/<uuid>.jsonl       (one file/session)
 */

const RECENT_CAP = 500

interface Candidate {
  agent: AgentSessionAgent
  path: string
  mtimeMs: number
}

/** USD price per million tokens, by token kind, for cost estimation. */
interface TokenPrice {
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
}

// Published list prices (USD / million tokens). Used only for a local estimate.
const CLAUDE_PRICES: Record<'opus' | 'sonnet' | 'haiku', TokenPrice> = {
  opus: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  sonnet: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  haiku: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 }
}

function claudePrice(model: string | undefined): TokenPrice {
  const m = (model ?? '').toLowerCase()
  if (m.includes('opus')) return CLAUDE_PRICES.opus
  if (m.includes('haiku')) return CLAUDE_PRICES.haiku
  return CLAUDE_PRICES.sonnet // default for Sonnet / unknown Claude models
}

// Codex logs only a cumulative total-token count, so we apply a single blended
// rate (GPT-5-class list pricing, weighted toward cached input) for the estimate.
const CODEX_BLENDED_PER_M = 2.5

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Trim a prompt to a single tidy line for the list. */
function tidyTitle(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > 140 ? `${oneLine.slice(0, 140)}…` : oneLine
}

/** The auto-injected AGENTS.md/instruction preamble is not a real user prompt. */
function isPreamble(text: string): boolean {
  const t = text.trimStart()
  return t.startsWith('# AGENTS.md') || t.startsWith('<INSTRUCTIONS>') || t.startsWith('# Instructions')
}

// A single over-long line (e.g. a giant embedded blob) is skipped rather than
// buffered, so memory stays bounded no matter how large the file is.
const MAX_LINE_BYTES = 16 * 1024 * 1024

/**
 * Stream a JSONL file line by line, invoking `onLine` for each. Reads through a
 * stream (never the whole file at once) so multi-hundred-MB session logs can't
 * exhaust the heap. Errors and over-long lines degrade silently.
 */
async function forEachLine(path: string, onLine: (line: string) => void): Promise<void> {
  try {
    const rl = createInterface({
      input: createReadStream(path, { encoding: 'utf8', highWaterMark: 1 << 20 }),
      crlfDelay: Infinity
    })
    try {
      for await (const line of rl) {
        if (line.length <= MAX_LINE_BYTES) onLine(line)
      }
    } finally {
      rl.close()
    }
  } catch {
    /* unreadable file — caller still gets whatever was parsed before the error */
  }
}

function parse(line: string): Record<string, unknown> | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    return null
  }
}

/** Pull plain text out of a message `content` field (string or content-part array). */
function contentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part && typeof part === 'object') {
          const p = part as Record<string, unknown>
          if (typeof p.text === 'string') return p.text
        }
        return ''
      })
      .filter(Boolean)
      .join(' ')
  }
  return ''
}

async function listCodexFiles(home: string): Promise<Candidate[]> {
  const root = join(home, '.codex', 'sessions')
  let names: string[] = []
  try {
    names = (await readdir(root, { recursive: true })) as string[]
  } catch {
    return []
  }
  const out: Candidate[] = []
  for (const name of names) {
    if (typeof name !== 'string' || !name.endsWith('.jsonl')) continue
    const path = join(root, name)
    const info = await stat(path).catch(() => null)
    if (info?.isFile()) out.push({ agent: 'codex', path, mtimeMs: info.mtimeMs })
  }
  return out
}

async function listClaudeFiles(home: string): Promise<Candidate[]> {
  const root = join(home, '.claude', 'projects')
  let projects: string[] = []
  try {
    projects = await readdir(root)
  } catch {
    return []
  }
  const out: Candidate[] = []
  for (const project of projects) {
    const dir = join(root, project)
    let files: string[] = []
    try {
      files = await readdir(dir)
    } catch {
      continue
    }
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue
      const path = join(dir, file)
      const info = await stat(path).catch(() => null)
      if (info?.isFile()) out.push({ agent: 'claude', path, mtimeMs: info.mtimeMs })
    }
  }
  return out
}

async function summarizeCodex(path: string, mtimeMs: number): Promise<AgentSessionSummary> {
  let id: string | undefined
  let cwd: string | undefined
  let branch: string | undefined
  let model: string | undefined
  let title = ''
  let messageCount = 0
  let tokens = 0
  let lastTs = 0

  await forEachLine(path, (line) => {
    const obj = parse(line)
    if (!obj) return
    const ts = Date.parse(typeof obj.timestamp === 'string' ? obj.timestamp : '')
    if (Number.isFinite(ts) && ts > lastTs) lastTs = ts
    const type = obj.type
    const payload = (obj.payload ?? {}) as Record<string, unknown>

    if (type === 'session_meta') {
      if (typeof payload.id === 'string') id = payload.id
      if (typeof payload.cwd === 'string') cwd = payload.cwd
      const git = payload.git as Record<string, unknown> | undefined
      if (git && typeof git.branch === 'string') branch = git.branch
    } else if (type === 'turn_context') {
      if (!cwd && typeof payload.cwd === 'string') cwd = payload.cwd
      if (!model && typeof payload.model === 'string') model = payload.model
    } else if (type === 'response_item' && payload.type === 'message') {
      const role = payload.role
      if (role === 'user' || role === 'assistant') {
        messageCount += 1
        if (!title && role === 'user') {
          const text = contentText(payload.content)
          if (text && !isPreamble(text)) title = tidyTitle(text)
        }
      }
    } else if (type === 'event_msg' && payload.type === 'token_count') {
      const info = payload.info as Record<string, unknown> | null | undefined
      const total = info?.total_token_usage as Record<string, unknown> | undefined
      if (total && typeof total.total_tokens === 'number') tokens = total.total_tokens
    } else if (!model && typeof payload.model === 'string') {
      model = payload.model
    }
  })

  return {
    id: id ?? path,
    agent: 'codex',
    title: title || '(untitled session)',
    model,
    cwd,
    branch,
    messageCount,
    tokens,
    cost: round2((tokens * CODEX_BLENDED_PER_M) / 1_000_000),
    updatedAt: new Date(lastTs || mtimeMs).toISOString(),
    filePath: path
  }
}

async function summarizeClaude(path: string, mtimeMs: number): Promise<AgentSessionSummary> {
  let id: string | undefined
  let cwd: string | undefined
  let branch: string | undefined
  let model: string | undefined
  let title = ''
  let messageCount = 0
  let tokens = 0
  let cost = 0
  let lastTs = 0

  await forEachLine(path, (line) => {
    const obj = parse(line)
    if (!obj) return
    if (!id && typeof obj.sessionId === 'string') id = obj.sessionId
    if (typeof obj.cwd === 'string') cwd = obj.cwd
    if (typeof obj.gitBranch === 'string' && obj.gitBranch) branch = obj.gitBranch
    const ts = Date.parse(typeof obj.timestamp === 'string' ? obj.timestamp : '')
    if (Number.isFinite(ts) && ts > lastTs) lastTs = ts

    if (obj.type === 'user' || obj.type === 'assistant') {
      const message = (obj.message ?? {}) as Record<string, unknown>
      messageCount += 1
      if (obj.type === 'assistant') {
        if (!model && typeof message.model === 'string') model = message.model
        const usage = message.usage as Record<string, unknown> | undefined
        if (usage) {
          const input = Number(usage.input_tokens) || 0
          const output = Number(usage.output_tokens) || 0
          const cacheWrite = Number(usage.cache_creation_input_tokens) || 0
          const cacheRead = Number(usage.cache_read_input_tokens) || 0
          tokens += input + output + cacheWrite + cacheRead
          // Price each message by the model that produced it (falls back to the
          // session model), since a session can switch models mid-run.
          const price = claudePrice(typeof message.model === 'string' ? message.model : model)
          cost +=
            (input * price.input +
              output * price.output +
              cacheWrite * price.cacheWrite +
              cacheRead * price.cacheRead) /
            1_000_000
        }
      } else if (!title) {
        const text = contentText(message.content)
        if (text && !isPreamble(text)) title = tidyTitle(text)
      }
    }
  })

  return {
    id: id ?? path,
    agent: 'claude',
    title: title || '(untitled session)',
    model,
    cwd,
    branch,
    messageCount,
    tokens,
    cost: round2(cost),
    updatedAt: new Date(lastTs || mtimeMs).toISOString(),
    filePath: path
  }
}

/** Run async work over items with a small concurrency limit. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

export async function readAgentSessionHistory(): Promise<AgentSessionHistory> {
  try {
    const home = homedir()
    const [codex, claude] = await Promise.all([listCodexFiles(home), listClaudeFiles(home)])
    const candidates = [...codex, ...claude].sort((a, b) => b.mtimeMs - a.mtimeMs)
    const scanned = candidates.length
    const recent = candidates.slice(0, RECENT_CAP)

    // Files are streamed line-by-line (see forEachLine), so memory stays bounded
    // even for multi-hundred-MB logs; a low concurrency keeps the peak small.
    const sessions = await mapLimit(recent, 4, async (candidate) => {
      try {
        return candidate.agent === 'codex'
          ? await summarizeCodex(candidate.path, candidate.mtimeMs)
          : await summarizeClaude(candidate.path, candidate.mtimeMs)
      } catch {
        return null
      }
    })

    const ok = sessions.filter((s): s is AgentSessionSummary => s !== null)
    ok.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    return { sessions: ok, scanned, recent: RECENT_CAP }
  } catch {
    // Never reject: a missing/locked home dir degrades to an empty history.
    return { sessions: [], scanned: 0, recent: RECENT_CAP }
  }
}
