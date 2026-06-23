import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import type { AgentSessionAgent, AgentSessionSummary } from '../../../shared/types'

interface ProviderDef {
  agent: AgentSessionAgent
  name: string
  accent: string
  /** Substrings (in a model id/command) that identify this provider. */
  match: string[]
}

const PROVIDERS: ProviderDef[] = [
  { agent: 'claude', name: 'Claude', accent: '#D97757', match: ['claude'] },
  { agent: 'codex', name: 'Codex', accent: '#10A37F', match: ['codex', 'gpt'] }
]

interface ProviderAgg {
  def: ProviderDef
  enabled: boolean
  sessions: number
  turns: number
  tokens: number
  cost: number
  model?: string
  workspace?: string
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

function aggregate(sessions: AgentSessionSummary[], def: ProviderDef, enabled: boolean): ProviderAgg {
  const mine = sessions.filter((s) => s.agent === def.agent)
  // Newest first so the "workspace" reflects the most recent project.
  const byRecent = [...mine].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  return {
    def,
    enabled,
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

  const aggs = useMemo(() => {
    const list = sessions ?? []
    return PROVIDERS.map((def) => {
      const enabled = models.some((m) => {
        const hay = `${m.id} ${m.command} ${m.tag}`.toLowerCase()
        return def.match.some((needle) => hay.includes(needle))
      })
      return aggregate(list, def, enabled)
    })
  }, [sessions, models])

  if (sessions === null) {
    return <div className="providers-loading">Reading provider usage…</div>
  }

  const enabledCount = aggs.filter((a) => a.enabled).length
  const withData = aggs.filter((a) => a.sessions > 0).length
  const maxTokens = Math.max(1, ...aggs.map((a) => a.tokens))
  // Show providers that are enabled or have data; hide the truly absent.
  const visible = aggs.filter((a) => a.enabled || a.sessions > 0)

  return (
    <div className="providers">
      <div className="providers-head">
        <h3>Providers</h3>
        <span className="providers-sub">
          {enabledCount} enabled · {withData} with data
        </span>
      </div>

      <div className="providers-list">
        {visible.map((a) => {
          const hasData = a.sessions > 0
          const pct = hasData ? Math.max(3, Math.round((a.tokens / maxTokens) * 100)) : 0
          return (
            <div className={`provider-card ${hasData ? '' : 'empty'}`} key={a.def.agent}>
              <div className="provider-card-head">
                <span className="provider-name">{a.def.name}</span>
                <span className={`provider-badge ${a.enabled ? 'on' : ''}`}>
                  {a.enabled ? 'Enabled' : 'Off'}
                </span>
              </div>

              {hasData ? (
                <>
                  <div className="provider-meta">
                    {a.model || a.def.name}
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
                    <span style={{ width: `${pct}%`, background: a.def.accent }} />
                  </div>
                </>
              ) : (
                <div className="provider-meta">No usage data on this device yet.</div>
              )}
            </div>
          )
        })}
      </div>

      <p className="remote-note">
        Aggregated from local Claude &amp; Codex session logs (most recent 500 sessions). Cost is an estimate from token
        usage × list pricing.
      </p>
    </div>
  )
}
