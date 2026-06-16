import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import type { AgentSessionAgent, AgentSessionSummary } from '../../../shared/types'

type Scope = 'all' | 'worktree'
type AgentFilter = 'all' | AgentSessionAgent

const AGENT_CYCLE: AgentFilter[] = ['all', 'claude', 'codex']
const AGENT_LABEL: Record<AgentFilter, string> = {
  all: 'All agents',
  claude: 'Claude',
  codex: 'Codex'
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const diff = Date.now() - then
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.round(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.round(months / 12)}y ago`
}

function formatTokens(n: number): string {
  if (!n) return '0 tok'
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}b tok`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}m tok`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k tok`
  return `${n} tok`
}

/** Normalize a cwd for grouping/comparison (case-insensitive, forward slashes). */
function normCwd(cwd: string | undefined): string {
  return (cwd ?? '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

/** Human-friendly project path for the group header. */
function displayCwd(cwd: string | undefined): string {
  if (!cwd) return 'Unknown location'
  return cwd.replace(/\\/g, '/').replace(/\/+$/, '')
}

function AgentGlyph({ agent }: { agent: AgentSessionAgent }): JSX.Element {
  if (agent === 'claude') {
    return (
      <span className="sess-glyph claude" aria-hidden="true" title="Claude">
        <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor">
          <path d="M8 1.4l1.3 3.3L12.6 3 11 6.4l3.6.3-3.2 1.3 3.2 1.3-3.6.3 1.6 3.4-3.3-1.7L8 14.6l-1.3-3.3L3.4 13 5 9.6l-3.6-.3 3.2-1.3L1.4 6.7 5 6.4 3.4 3l3.3 1.7z" />
        </svg>
      </span>
    )
  }
  return (
    <span className="sess-glyph codex" aria-hidden="true" title="Codex">
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3">
        <circle cx="8" cy="8" r="5.4" />
        <circle cx="8" cy="8" r="2" />
      </svg>
    </span>
  )
}

interface Group {
  key: string
  label: string
  sessions: AgentSessionSummary[]
}

export default function SessionHistoryPanel(): JSX.Element {
  const toggleHistory = useStore((s) => s.toggleHistory)
  const workspace = useStore((s) => s.workspace)

  const [all, setAll] = useState<AgentSessionSummary[]>([])
  const [recent, setRecent] = useState(500)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<Scope>('all')
  const [agent, setAgent] = useState<AgentFilter>('all')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      if (typeof window.api.getSessionHistory !== 'function') {
        // The preload bundle predates this feature — only a full app restart
        // (not a renderer refresh) loads the new bridge method.
        setError('Restart GenNal to enable session history (the app needs a full relaunch).')
        return
      }
      const history = await window.api.getSessionHistory()
      setAll(history.sessions)
      setRecent(history.recent)
    } catch {
      setError('Could not read agent session history on this device.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const workspaceCwd = workspace?.kind === 'project' ? normCwd(workspace.path) : ''

  const groups = useMemo<Group[]>(() => {
    const needle = query.trim().toLowerCase()
    const filtered = all.filter((session) => {
      if (agent !== 'all' && session.agent !== agent) return false
      if (scope === 'worktree' && workspaceCwd && normCwd(session.cwd) !== workspaceCwd) return false
      if (needle) {
        const hay = `${session.title} ${session.model ?? ''} ${session.branch ?? ''} ${session.cwd ?? ''}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })

    const order: string[] = []
    const byKey = new Map<string, Group>()
    for (const session of filtered) {
      const key = normCwd(session.cwd) || '∅'
      let group = byKey.get(key)
      if (!group) {
        group = { key, label: displayCwd(session.cwd), sessions: [] }
        byKey.set(key, group)
        order.push(key)
      }
      group.sessions.push(session)
    }
    return order.map((key) => byKey.get(key) as Group)
  }, [all, query, scope, agent, workspaceCwd])

  const shown = groups.reduce((sum, group) => sum + group.sessions.length, 0)

  const toggleGroup = (key: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const cycleAgent = (): void =>
    setAgent((current) => AGENT_CYCLE[(AGENT_CYCLE.indexOf(current) + 1) % AGENT_CYCLE.length])

  return (
    <div className="sess-panel">
      <header className="sess-head">
        <button className="tasks-icon-btn" title="Close" onClick={() => toggleHistory(false)}>
          <svg viewBox="0 0 16 16" width="15" height="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
        <div className="sess-title-wrap">
          <span className="sess-title">Agent Session History</span>
          <span className="sess-sub">
            {loading ? 'Reading sessions…' : `${shown} shown · ${recent} recent`}
          </span>
        </div>
        <div className="sess-scope" role="tablist" aria-label="Scope">
          <button
            className={`sess-chip ${scope === 'all' ? 'active' : ''}`}
            onClick={() => setScope('all')}
          >
            All
          </button>
          <button
            className={`sess-chip ${scope === 'worktree' ? 'active' : ''}`}
            title={workspaceCwd ? 'Sessions in the current workspace' : 'Open a project to filter by worktree'}
            disabled={!workspaceCwd}
            onClick={() => setScope('worktree')}
          >
            Worktree
          </button>
        </div>
        <button
          className={`tasks-icon-btn ${agent !== 'all' ? 'active' : ''}`}
          title={`Filter: ${AGENT_LABEL[agent]}`}
          onClick={cycleAgent}
        >
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2.5 4h11l-4.3 5v3.5L6.8 14V9z" />
          </svg>
        </button>
        <button className="tasks-icon-btn ghost" title="Refresh" disabled={loading} onClick={() => void load()}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M13 3v3h-3" />
            <path d="M13 6A5.5 5.5 0 1 0 13.5 9" />
          </svg>
        </button>
      </header>

      <div className="sess-search">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" />
          <path d="M11 11l3 3" />
        </svg>
        <input
          className="sess-search-input"
          placeholder="Search sessions"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {agent !== 'all' && <span className="sess-agent-pill">{AGENT_LABEL[agent]}</span>}
      </div>

      <div className="sess-list">
        {error && <div className="sess-empty">{error}</div>}
        {!error && loading && all.length === 0 && <div className="sess-empty">Loading…</div>}
        {!error && !loading && shown === 0 && (
          <div className="sess-empty">No sessions match your filters.</div>
        )}
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.key)
          return (
            <section className="sess-group" key={group.key}>
              <button className="sess-group-head" onClick={() => toggleGroup(group.key)}>
                <svg
                  className={`sess-caret ${isCollapsed ? 'closed' : ''}`}
                  viewBox="0 0 16 16"
                  width="12"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6 4l4 4-4 4" />
                </svg>
                <span className="sess-group-label" title={group.label}>
                  {group.label}
                </span>
                <span className="sess-group-count">{group.sessions.length}</span>
              </button>
              {!isCollapsed &&
                group.sessions.map((session) => (
                  <div className="sess-row" key={session.id} title={session.title}>
                    <div className="sess-row-top">
                      <span className="sess-row-title">{session.title}</span>
                      <span className="sess-row-time">{relativeTime(session.updatedAt)}</span>
                    </div>
                    <div className="sess-row-meta">
                      <AgentGlyph agent={session.agent} />
                      {session.model && (
                        <span className="sess-model" title={session.model}>
                          {session.model}
                        </span>
                      )}
                      {session.branch && (
                        <>
                          <span className="sess-dot">·</span>
                          <span className="sess-branch" title={session.branch}>
                            {session.branch}
                          </span>
                        </>
                      )}
                      <span className="sess-dot">·</span>
                      <span className="sess-msgs">{session.messageCount} msgs</span>
                      {session.tokens > 0 && (
                        <>
                          <span className="sess-dot">·</span>
                          <span className="sess-tokens">{formatTokens(session.tokens)}</span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
            </section>
          )
        })}
      </div>
    </div>
  )
}
