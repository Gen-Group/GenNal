import { homedir } from 'os'
import { join } from 'path'
import { readdir, readFile, stat } from 'fs/promises'
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

async function readLines(path: string): Promise<string[]> {
  try {
    const raw = await readFile(path, 'utf8')
    return raw.split('\n')
  } catch {
    return []
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

function summarizeCodex(path: string, mtimeMs: number, lines: string[]): AgentSessionSummary {
  let id: string | undefined
  let cwd: string | undefined
  let branch: string | undefined
  let model: string | undefined
  let title = ''
  let messageCount = 0
  let tokens = 0
  let lastTs = 0

  for (const line of lines) {
    const obj = parse(line)
    if (!obj) continue
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
  }

  return {
    id: id ?? path,
    agent: 'codex',
    title: title || '(untitled session)',
    model,
    cwd,
    branch,
    messageCount,
    tokens,
    updatedAt: new Date(lastTs || mtimeMs).toISOString(),
    filePath: path
  }
}

function summarizeClaude(path: string, mtimeMs: number, lines: string[]): AgentSessionSummary {
  let id: string | undefined
  let cwd: string | undefined
  let branch: string | undefined
  let model: string | undefined
  let title = ''
  let messageCount = 0
  let tokens = 0
  let lastTs = 0

  for (const line of lines) {
    const obj = parse(line)
    if (!obj) continue
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
          tokens +=
            (Number(usage.input_tokens) || 0) +
            (Number(usage.output_tokens) || 0) +
            (Number(usage.cache_creation_input_tokens) || 0) +
            (Number(usage.cache_read_input_tokens) || 0)
        }
      } else if (!title) {
        const text = contentText(message.content)
        if (text && !isPreamble(text)) title = tidyTitle(text)
      }
    }
  }

  return {
    id: id ?? path,
    agent: 'claude',
    title: title || '(untitled session)',
    model,
    cwd,
    branch,
    messageCount,
    tokens,
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

    const sessions = await mapLimit(recent, 8, async (candidate) => {
      try {
        const lines = await readLines(candidate.path)
        return candidate.agent === 'codex'
          ? summarizeCodex(candidate.path, candidate.mtimeMs, lines)
          : summarizeClaude(candidate.path, candidate.mtimeMs, lines)
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
