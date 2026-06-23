import { homedir } from 'os'
import { join } from 'path'
import { readFile, readdir, stat } from 'fs/promises'
import { createReadStream } from 'fs'
import type { CliUsage, CliUsageAccount, CliUsageLimit, UsagePeriod } from '../shared/types'

/**
 * Reads real usage data for each AI CLI straight from the files the tools
 * themselves write under the user's home directory. Everything here is
 * best-effort and read-only: any missing file or parse error degrades to a
 * partial result instead of throwing.
 *
 * One deliberate exception: to surface Claude's live plan-usage limits (which
 * Claude Code does NOT persist to disk), we read the local OAuth access token
 * from ~/.claude/.credentials.json and call Anthropic's own usage endpoint. The
 * token is used only for that request to api.anthropic.com and is never logged
 * or stored. No other credential store is read.
 */

interface DailyActivity {
  date: string
  messageCount: number
  sessionCount: number
  toolCallCount: number
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return null
  }
}

async function countEntries(dir: string): Promise<number> {
  try {
    return (await readdir(dir)).length
  } catch {
    return 0
  }
}

async function fileMtime(path: string): Promise<string | undefined> {
  try {
    return (await stat(path)).mtime.toISOString()
  } catch {
    return undefined
  }
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Start-of-day timestamp `days` ago (inclusive of today). */
function windowStart(days: number): number {
  const cutoff = new Date()
  cutoff.setHours(0, 0, 0, 0)
  cutoff.setDate(cutoff.getDate() - (days - 1))
  return cutoff.getTime()
}

/** Sum daily activity over the last `days` calendar days (inclusive of today). */
function summarize(label: string, daily: DailyActivity[], days: number): UsagePeriod {
  const cutoffKey = dayKey(new Date(windowStart(days)))
  let messages = 0
  let sessions = 0
  let toolCalls = 0
  for (const day of daily) {
    if (day.date >= cutoffKey) {
      messages += day.messageCount || 0
      sessions += day.sessionCount || 0
      toolCalls += day.toolCallCount || 0
    }
  }
  return { label, messages, sessions, toolCalls, unit: 'msgs' }
}

interface TimedEntry {
  ts: number
  session: string
}

/** Build a window from timestamped log entries (one entry == one prompt/message). */
function windowFromEntries(label: string, entries: TimedEntry[], days: number, unit: string): UsagePeriod {
  const start = windowStart(days)
  const inWindow = entries.filter((e) => e.ts >= start)
  const sessions = new Set(inWindow.map((e) => e.session).filter(Boolean)).size
  return { label, messages: inWindow.length, sessions, toolCalls: 0, unit }
}

/** Map Claude's rate-limit/org tier codes onto a friendly plan name. */
function claudePlan(oa: Record<string, unknown>): string {
  const tier = String(oa.organizationRateLimitTier || oa.userRateLimitTier || '').toLowerCase()
  const orgType = String(oa.organizationType || '').toLowerCase()
  if (tier.includes('max_20x')) return 'Max 20×'
  if (tier.includes('max_5x')) return 'Max 5×'
  if (tier.includes('max') || orgType === 'claude_max') return 'Max'
  if (tier.includes('team')) return 'Team'
  if (tier.includes('enterprise')) return 'Enterprise'
  if (tier.includes('pro') || orgType === 'claude_pro') return 'Pro'
  if (tier.includes('free')) return 'Free'
  if (orgType) return orgType.replace(/^claude_/, '').replace(/_/g, ' ')
  return 'Claude'
}

interface OAuthUsageWindow {
  utilization?: number | null
  resets_at?: string | null
}

interface OAuthUsageResponse {
  five_hour?: OAuthUsageWindow | null
  seven_day?: OAuthUsageWindow | null
  seven_day_opus?: OAuthUsageWindow | null
  seven_day_sonnet?: OAuthUsageWindow | null
  extra_usage?: {
    is_enabled?: boolean
    monthly_limit?: number | null
    used_credits?: number | null
    utilization?: number | null
    currency?: string | null
  } | null
}

/**
 * Fetch Claude's live plan-usage limits from Anthropic using the local OAuth
 * token. Returns null on any failure (no token, expired, offline, non-200) so
 * the rest of the usage panel still renders. Times out after 6s.
 */
async function fetchClaudeLimits(
  home: string
): Promise<{ limits: CliUsageLimit[]; credits?: string } | null> {
  const creds = await readJson<{ claudeAiOauth?: { accessToken?: string; expiresAt?: number } }>(
    join(home, '.claude', '.credentials.json')
  )
  const oauth = creds?.claudeAiOauth
  const token = oauth?.accessToken
  if (!token) return null
  if (typeof oauth.expiresAt === 'number' && oauth.expiresAt < Date.now()) return null // token expired

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  try {
    const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': 'claude-cli'
      },
      signal: controller.signal
    })
    if (!res.ok) return null
    const data = (await res.json()) as OAuthUsageResponse

    const limits: CliUsageLimit[] = []
    const add = (label: string, win: OAuthUsageWindow | null | undefined, windowMinutes: number): void => {
      if (!win || typeof win.utilization !== 'number') return
      limits.push({
        label,
        usedPercent: win.utilization,
        windowMinutes,
        resetsAt: win.resets_at ?? undefined
      })
    }
    add('Current session', data.five_hour, 300)
    add('Weekly · All models', data.seven_day, 10_080)
    add('Weekly · Opus', data.seven_day_opus, 10_080)
    add('Weekly · Sonnet', data.seven_day_sonnet, 10_080)
    if (limits.length === 0) return null

    let credits: string | undefined
    const extra = data.extra_usage
    if (extra?.is_enabled && typeof extra.used_credits === 'number') {
      const cur = extra.currency || 'USD'
      const used = extra.used_credits.toLocaleString(undefined, { style: 'currency', currency: cur })
      credits =
        typeof extra.monthly_limit === 'number'
          ? `${used} of ${extra.monthly_limit.toLocaleString(undefined, { style: 'currency', currency: cur })} used`
          : `${used} used`
    }
    return { limits, credits }
  } catch {
    return null // offline, aborted, or malformed response
  } finally {
    clearTimeout(timer)
  }
}

async function readClaudeUsage(home: string): Promise<CliUsage> {
  const usage: CliUsage = {
    modelId: 'claude',
    label: 'Claude',
    available: false,
    source: '~/.claude',
    periods: []
  }

  const config = await readJson<{ oauthAccount?: Record<string, unknown> }>(join(home, '.claude.json'))
  const oa = config?.oauthAccount
  if (oa) {
    usage.available = true
    const account: CliUsageAccount = {
      email: typeof oa.emailAddress === 'string' ? oa.emailAddress : undefined,
      name: typeof oa.displayName === 'string' ? oa.displayName : undefined,
      plan: claudePlan(oa),
      org: typeof oa.organizationName === 'string' ? oa.organizationName : undefined,
      memberSince: typeof oa.accountCreatedAt === 'string' ? oa.accountCreatedAt : undefined,
      subscriptionSince: typeof oa.subscriptionCreatedAt === 'string' ? oa.subscriptionCreatedAt : undefined,
      trialEndsAt: typeof oa.claudeCodeTrialEndsAt === 'string' ? oa.claudeCodeTrialEndsAt : undefined
    }
    usage.account = account
  }

  // Claude Code logs every prompt to history.jsonl with a millisecond `timestamp`
  // and `sessionId`. Unlike stats-cache.json (recomputed only periodically, so it
  // lags by days), this file is written live — we use it for the recent windows
  // and the true "last active" time so today's activity isn't shown as zero.
  const histRows = await readJsonl(join(home, '.claude', 'history.jsonl'))
  const entries: TimedEntry[] = []
  for (const row of histRows) {
    const ts = typeof row.timestamp === 'number' ? row.timestamp : NaN
    if (Number.isFinite(ts)) {
      entries.push({ ts, session: typeof row.sessionId === 'string' ? row.sessionId : '' })
    }
  }

  const stats = await readJson<{
    dailyActivity?: DailyActivity[]
    totalSessions?: number
    totalMessages?: number
    firstSessionDate?: string
    lastComputedDate?: string
    hourCounts?: Record<string, number>
  }>(join(home, '.claude', 'stats-cache.json'))
  const daily = stats && Array.isArray(stats.dailyActivity) ? stats.dailyActivity : []

  // Recent windows: prefer the live prompt history; fall back to the cached
  // daily activity (counts messages) only when history is unavailable.
  if (entries.length > 0) {
    usage.available = true
    usage.periods = [
      windowFromEntries('Today', entries, 1, 'prompts'),
      windowFromEntries('Last 7 days', entries, 7, 'prompts'),
      windowFromEntries('Last 30 days', entries, 30, 'prompts')
    ]
  } else if (daily.length > 0) {
    usage.available = true
    usage.periods = [
      summarize('Today', daily, 1),
      summarize('Last 7 days', daily, 7),
      summarize('Last 30 days', daily, 30)
    ]
  }

  if (stats) {
    usage.available = true

    let busiestHour: number | undefined
    if (stats.hourCounts) {
      let best = -1
      for (const [hour, count] of Object.entries(stats.hourCounts)) {
        if (count > best) {
          best = count
          busiestHour = Number(hour)
        }
      }
    }

    // True last-active comes from live history; fall back to the cache's newest day.
    const lastActive =
      entries.length > 0
        ? new Date(Math.max(...entries.map((e) => e.ts))).toISOString()
        : daily.length > 0
          ? daily[daily.length - 1].date
          : undefined
    usage.totals = {
      sessions: stats.totalSessions,
      messages: stats.totalMessages,
      toolCalls: daily.reduce((sum, d) => sum + (d.toolCallCount || 0), 0),
      firstSession: stats.firstSessionDate,
      lastActive,
      busiestHour
    }
    usage.note =
      entries.length > 0 && stats.lastComputedDate
        ? `Recent windows are live from prompt history; all-time totals are from Claude's stats cache (last computed ${stats.lastComputedDate}).`
        : stats.lastComputedDate
          ? `Claude local stats last computed ${stats.lastComputedDate}.`
          : usage.note
  } else if (entries.length > 0) {
    // History only (no stats cache): still give real totals from the prompt log.
    const timestamps = entries.map((e) => e.ts)
    usage.totals = {
      sessions: new Set(entries.map((e) => e.session).filter(Boolean)).size || undefined,
      messages: entries.length,
      firstSession: new Date(Math.min(...timestamps)).toISOString(),
      lastActive: new Date(Math.max(...timestamps)).toISOString()
    }
    usage.note = 'Activity reflects Claude prompt history on this device.'
  }

  // Live plan-usage limits (session + weekly windows) from Anthropic. These
  // aren't written to disk by Claude Code, so this is the only way to show them.
  const limitData = await fetchClaudeLimits(home)
  if (limitData) {
    usage.available = true
    usage.limits = limitData.limits
    if (limitData.credits) {
      usage.note = usage.note ? `${usage.note} Usage credits: ${limitData.credits}.` : `Usage credits: ${limitData.credits}.`
    }
  }

  if (!usage.available) {
    usage.note = 'Claude Code is not signed in on this device, or its config was not found.'
  }
  return usage
}

/** Parse a JSONL file into objects, skipping blank/corrupt lines. */
async function readJsonl(path: string): Promise<Record<string, unknown>[]> {
  try {
    const raw = await readFile(path, 'utf8')
    const out: Record<string, unknown>[] = []
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        out.push(JSON.parse(trimmed) as Record<string, unknown>)
      } catch {
        /* skip malformed line */
      }
    }
    return out
  } catch {
    return []
  }
}

/** Friendly label for a rate-limit window given its length in minutes. */
function limitLabel(minutes: number): string {
  if (minutes === 300) return '5h'
  if (minutes === 10080) return 'Weekly'
  if (minutes % 1440 === 0) return `${minutes / 1440}d`
  if (minutes % 60 === 0) return `${minutes / 60}h`
  return `${minutes}m`
}

function codexPlanName(planType: unknown): string {
  const p = String(planType || '').toLowerCase()
  if (!p) return 'OpenAI Codex'
  if (p === 'plus') return 'Plus'
  if (p === 'pro') return 'Pro'
  if (p === 'team') return 'Team'
  if (p === 'enterprise') return 'Enterprise'
  if (p === 'free') return 'Free'
  return p.charAt(0).toUpperCase() + p.slice(1)
}

interface CodexRateWindow {
  used_percent?: number
  window_minutes?: number
  resets_at?: number
}
interface CodexRateLimits {
  primary?: CodexRateWindow
  secondary?: CodexRateWindow
  plan_type?: string
}

/**
 * Read at most the last `maxBytes` of a file as UTF-8. Codex session logs can be
 * hundreds of MB, so we never slurp the whole file — the freshest rate-limit
 * reading is at the end anyway. The first (likely partial) line is discarded by
 * the JSON.parse in the caller.
 */
async function readTail(path: string, maxBytes: number): Promise<string> {
  const info = await stat(path).catch(() => null)
  if (!info) return ''
  const start = Math.max(0, info.size - maxBytes)
  return new Promise((resolve) => {
    let data = ''
    const stream = createReadStream(path, { start, encoding: 'utf8' })
    stream.on('data', (chunk) => (data += chunk))
    stream.on('end', () => resolve(data))
    stream.on('error', () => resolve(''))
  })
}

/**
 * Codex writes the live `rate_limits` payload (5h primary + weekly secondary
 * windows, used %, reset time, plan) into each session rollout on every turn.
 * We scan the most recently touched sessions and take the freshest reading.
 */
async function readCodexRateLimits(home: string): Promise<CodexRateLimits | null> {
  const root = join(home, '.codex', 'sessions')
  let names: string[] = []
  try {
    names = (await readdir(root, { recursive: true })) as string[]
  } catch {
    return null
  }

  const files: { path: string; mtime: number }[] = []
  for (const name of names) {
    if (typeof name === 'string' && name.endsWith('.jsonl')) {
      const path = join(root, name)
      const info = await stat(path).catch(() => null)
      if (info) files.push({ path, mtime: info.mtimeMs })
    }
  }
  files.sort((a, b) => b.mtime - a.mtime)

  let best: { ts: number; rl: CodexRateLimits } | null = null
  for (const file of files.slice(0, 6)) {
    const raw = await readTail(file.path, 4 * 1024 * 1024)
    if (!raw.includes('"rate_limits"')) continue
    for (const line of raw.split('\n')) {
      if (!line.includes('"rate_limits"')) continue
      try {
        const obj = JSON.parse(line) as { timestamp?: string; payload?: { rate_limits?: CodexRateLimits } }
        const rl = obj.payload?.rate_limits
        const ts = Date.parse(obj.timestamp || '')
        if (rl && Number.isFinite(ts) && (!best || ts > best.ts)) best = { ts, rl }
      } catch {
        /* skip malformed line */
      }
    }
  }
  return best?.rl ?? null
}

function toLimit(label: string, win: CodexRateWindow): CliUsageLimit {
  return {
    label: win.window_minutes ? limitLabel(win.window_minutes) : label,
    usedPercent: typeof win.used_percent === 'number' ? win.used_percent : 0,
    windowMinutes: win.window_minutes,
    resetsAt: win.resets_at ? new Date(win.resets_at * 1000).toISOString() : undefined
  }
}

async function readCodexUsage(home: string): Promise<CliUsage> {
  const usage: CliUsage = {
    modelId: 'codex',
    label: 'Codex',
    available: false,
    source: '~/.codex',
    periods: []
  }

  // Live 5h / weekly rate-limit windows + plan, read from the freshest session.
  const rl = await readCodexRateLimits(home)
  let plan = 'OpenAI Codex'
  if (rl) {
    const limits: CliUsageLimit[] = []
    if (rl.primary) limits.push(toLimit('5h', rl.primary))
    if (rl.secondary) limits.push(toLimit('Weekly', rl.secondary))
    if (limits.length > 0) usage.limits = limits
    plan = codexPlanName(rl.plan_type)
  }

  // Codex records every prompt in history.jsonl with a unix `ts` (seconds) and
  // `session_id`, which is enough for real message/session windows. We never
  // touch the token store (auth.json).
  const rows = await readJsonl(join(home, '.codex', 'history.jsonl'))
  const entries: TimedEntry[] = []
  for (const row of rows) {
    const ts = typeof row.ts === 'number' ? row.ts * 1000 : NaN
    if (Number.isFinite(ts)) {
      entries.push({ ts, session: typeof row.session_id === 'string' ? row.session_id : '' })
    }
  }

  if (entries.length > 0) {
    usage.available = true
    usage.account = { plan }
    usage.periods = [
      windowFromEntries('Today', entries, 1, 'prompts'),
      windowFromEntries('Last 7 days', entries, 7, 'prompts'),
      windowFromEntries('Last 30 days', entries, 30, 'prompts')
    ]
    const timestamps = entries.map((e) => e.ts)
    usage.totals = {
      sessions: new Set(entries.map((e) => e.session).filter(Boolean)).size || undefined,
      messages: entries.length,
      firstSession: new Date(Math.min(...timestamps)).toISOString(),
      lastActive: new Date(Math.max(...timestamps)).toISOString()
    }
    usage.note = usage.limits
      ? 'Live 5h / weekly limits from Codex; activity counts from local prompt history.'
      : 'Counts reflect Codex CLI prompt history on this device (token usage is not stored locally).'
    return usage
  }

  // Fallback: no parseable history, but the CLI may still be installed.
  const sessionCount = await countEntries(join(home, '.codex', 'sessions'))
  const lastActive = await fileMtime(join(home, '.codex', 'history.jsonl'))
  if (usage.limits || sessionCount > 0 || lastActive) {
    usage.available = true
    usage.account = { plan }
    usage.totals = { sessions: sessionCount || undefined, lastActive }
    usage.note = 'Codex CLI usage on this device.'
  } else {
    usage.note = 'Codex CLI was not found on this device.'
  }
  return usage
}

async function readGeminiUsage(home: string): Promise<CliUsage> {
  const usage: CliUsage = {
    modelId: 'gemini',
    label: 'Gemini',
    available: false,
    source: '~/.gemini',
    periods: []
  }

  const accounts = await readJson<{ active?: string }>(join(home, '.gemini', 'google_accounts.json'))

  // Gemini keeps one history file per conversation; their modified times give us
  // a real "chats active in window" signal even though token counts aren't stored.
  const entries: TimedEntry[] = []
  try {
    const dir = join(home, '.gemini', 'history')
    for (const name of await readdir(dir)) {
      const info = await stat(join(dir, name)).catch(() => null)
      // session left blank so per-window counts show conversations, not duplicate "sessions".
      if (info) entries.push({ ts: info.mtimeMs, session: '' })
    }
  } catch {
    /* no history dir */
  }

  if (accounts?.active || entries.length > 0) {
    usage.available = true
    usage.account = { email: accounts?.active, plan: 'Google account' }
    if (entries.length > 0) {
      usage.periods = [
        windowFromEntries('Today', entries, 1, 'chats'),
        windowFromEntries('Last 7 days', entries, 7, 'chats'),
        windowFromEntries('Last 30 days', entries, 30, 'chats')
      ]
      const timestamps = entries.map((e) => e.ts)
      usage.totals = {
        sessions: entries.length,
        firstSession: new Date(Math.min(...timestamps)).toISOString(),
        lastActive: new Date(Math.max(...timestamps)).toISOString()
      }
    }
    usage.note = 'Gemini CLI stores conversations but not token counts; showing chat activity on this device.'
  } else {
    usage.note = 'Gemini CLI was not found on this device.'
  }
  return usage
}

/** Returns the best-effort usage snapshot for one model id. */
export async function readCliUsage(modelId: string): Promise<CliUsage> {
  const home = homedir()
  try {
    switch (modelId) {
      case 'claude':
        return await readClaudeUsage(home)
      case 'codex':
        return await readCodexUsage(home)
      case 'gemini':
        return await readGeminiUsage(home)
      default:
        return {
          modelId,
          label: modelId,
          available: false,
          periods: [],
          note: 'Usage reporting is only available for Claude, Codex, and Gemini.'
        }
    }
  } catch {
    return {
      modelId,
      label: modelId,
      available: false,
      periods: [],
      note: 'Usage data could not be read on this device.'
    }
  }
}
