import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import type { AgentSessionAgent, AgentSessionSummary, ModelDef } from '../../../shared/types'

interface Provider {
  id: string
  name: string
  accent: string
  custom: boolean
  /** Which session-log agent (if any) backs this model's stats. */
  agent: AgentSessionAgent | null
}

interface ProviderAgg {
  provider: Provider
  sessions: number
  turns: number
  tokens: number
  cost: number
  model?: string
  workspace?: string
}

/** Map a model definition onto the session-log agent that records its usage. */
function detectAgent(m: ModelDef): AgentSessionAgent | null {
  const hay = `${m.id} ${m.command} ${m.tag}`.toLowerCase()
  if (hay.includes('claude')) return 'claude'
  if (hay.includes('codex') || hay.includes('gpt')) return 'codex'
  return null
}

function fmtTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return `${n}`
}

function fmtCost(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Most frequent non-empty value in a list. */
function mode(values: (string | undefined)[]): string | undefined {
  const counts = new Map<string, number>()
  for (const v of values) {
    if (!v) continue
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  let best: string | undefined
  let bestCount = 0
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v
      bestCount = c
    }
  }
  return best
}

function basename(path?: string): string | undefined {
  if (!path) return undefined
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1]
}

function aggregate(sessions: AgentSessionSummary[], provider: Provider): ProviderAgg {
  const mine = provider.agent ? sessions.filter((s) => s.agent === provider.agent) : []
  // Newest first so the "workspace" reflects the most recent project.
  const byRecent = [...mine].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  return {
    provider,
    sessions: mine.length,
    turns: mine.reduce((sum, s) => sum + (s.messageCount || 0), 0),
    tokens: mine.reduce((sum, s) => sum + (s.tokens || 0), 0),
    cost: mine.reduce((sum, s) => sum + (s.cost || 0), 0),
    model: mode(mine.map((s) => s.model)),
    workspace: basename(byRecent.find((s) => s.cwd)?.cwd)
  }
}

export default function ProvidersUsage(): JSX.Element {
  const models = useStore((s) => s.models)
  const [sessions, setSessions] = useState<AgentSessionSummary[] | null>(null)

  useEffect(() => {
    let alive = true
    void window.api
      .getSessionHistory()
      .then((h) => alive && setSessions(h.sessions))
      .catch(() => alive && setSessions([]))
    return () => {
      alive = false
    }
  }, [])

  // Every launchable AI CLI — built-in or user-added — becomes a provider. The
  // bare shell (no command) is skipped since it has no model usage to report.
  const providers = useMemo<Provider[]>(
    () =>
      models
        .filter((m) => m.command.trim().length > 0)
        .map((m) => ({
          id: m.id,
          name: m.label,
          accent: m.accent,
          custom: Boolean(m.custom),
          agent: detectAgent(m)
        })),
    [models]
  )

  const aggs = useMemo(() => {
    const list = sessions ?? []
    return providers.map((p) => aggregate(list, p))
  }, [sessions, providers])

  if (sessions === null) {
    return <div className="providers-loading">Reading provider usage…</div>
  }

  const withData = aggs.filter((a) => a.sessions > 0).length
  const maxTokens = Math.max(1, ...aggs.map((a) => a.tokens))

  return (
    <div className="providers">
      <div className="providers-head">
        <h3>Providers</h3>
        <span className="providers-sub">
          {aggs.length} model{aggs.length === 1 ? '' : 's'} · {withData} with data
        </span>
      </div>

      <div className="providers-list">
        {aggs.map((a) => {
          const hasData = a.sessions > 0
          const pct = hasData ? Math.max(3, Math.round((a.tokens / maxTokens) * 100)) : 0
          return (
            <div className={`provider-card ${hasData ? '' : 'empty'}`} key={a.provider.id}>
              <div className="provider-card-head">
                <span className="provider-name">
                  <span
                    className="provider-swatch"
                    style={{ background: a.provider.accent }}
                    aria-hidden="true"
                  />
                  {a.provider.name}
                </span>
                <span className={`provider-badge ${hasData ? 'on' : ''}`}>
                  {hasData ? 'Active' : a.provider.custom ? 'Added' : 'Ready'}
                </span>
              </div>

              {hasData ? (
                <>
                  <div className="provider-meta">
                    {a.model || a.provider.name}
                    {a.workspace ? ` · ${a.workspace}` : ''}
                  </div>
                  <div className="provider-stats">
                    <span className="provider-tokens">{fmtTokens(a.tokens)} tokens</span>
                    <span className="provider-sessions">
                      {a.sessions.toLocaleString()} session{a.sessions === 1 ? '' : 's'} ·{' '}
                      {a.turns.toLocaleString()} turns
                    </span>
                    <span className="provider-cost">{fmtCost(a.cost)}</span>
                  </div>
                  <div className="provider-bar">
                    <span style={{ width: `${pct}%`, background: a.provider.accent }} />
                  </div>
                </>
              ) : (
                <div className="provider-meta">
                  {a.provider.agent
                    ? 'No usage data on this device yet.'
                    : 'Launch a session to start tracking usage.'}
                </div>
              )}
            </div>
          )
        })}
        {aggs.length === 0 && (
          <div className="provider-card empty">
            <div className="provider-meta">No models configured yet.</div>
          </div>
        )}
      </div>

      <p className="remote-note">
        Token &amp; cost figures are aggregated from local Claude &amp; Codex session logs (most recent 500
        sessions); other CLIs are listed without token counts. Cost is an estimate from token usage × list
        pricing.
      </p>
    </div>
  )
}
