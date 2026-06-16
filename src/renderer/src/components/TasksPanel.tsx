import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import type { GithubWorkItem } from '../../../shared/types'

type TaskTab = 'issues' | 'prs' | 'projects'
type TaskScope = 'open' | 'assigned'

/** Turn a git remote URL (https or ssh) into "owner/name", or null. */
function parseGithubRepo(remoteUrl: string | undefined): string | null {
  if (!remoteUrl) return null
  const cleaned = remoteUrl
    .trim()
    .replace(/^git@github\.com:/, '')
    .replace(/^ssh:\/\/git@github\.com\//, '')
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/^github\.com\//, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '')
  const match = cleaned.match(/^([^/\s]+)\/([^/\s]+)$/)
  return match ? `${match[1]}/${match[2]}` : null
}

function buildQuery(tab: TaskTab, scope: TaskScope): string {
  const parts = [tab === 'prs' ? 'is:pr' : 'is:issue', 'is:open']
  if (scope === 'assigned') parts.push('assignee:@me')
  return parts.join(' ')
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const diff = Date.now() - then
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.round(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.round(months / 12)}y ago`
}

function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}

function statusLabel(item: GithubWorkItem): { text: string; tone: string } {
  if (item.kind === 'pr') {
    if (item.merged) return { text: 'Merged', tone: 'merged' }
    if (item.state === 'closed') return { text: 'Closed', tone: 'closed' }
    if (item.draft) return { text: 'Draft', tone: 'draft' }
    return { text: 'Open', tone: 'open' }
  }
  return item.state === 'closed' ? { text: 'Closed', tone: 'closed' } : { text: 'Open', tone: 'open' }
}

export default function TasksPanel(): JSX.Element {
  const toggleTasks = useStore((s) => s.toggleTasks)
  const workspace = useStore((s) => s.workspace)
  const githubToken = useStore((s) => s.githubToken)
  const setGithubToken = useStore((s) => s.setGithubToken)

  const repo = parseGithubRepo(workspace?.git?.remoteUrl)
  const [tab, setTab] = useState<TaskTab>('issues')
  const [scope, setScope] = useState<TaskScope>('open')
  const [query, setQuery] = useState<string>(() => buildQuery('issues', 'open'))
  const [items, setItems] = useState<GithubWorkItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tokenOpen, setTokenOpen] = useState(false)
  const [tokenDraft, setTokenDraft] = useState('')
  const reqId = useRef(0)

  const runFetch = useCallback(
    async (q: string): Promise<void> => {
      if (!repo) {
        setItems([])
        setTotal(0)
        setError(null)
        return
      }
      const id = ++reqId.current
      setLoading(true)
      setError(null)
      try {
        const result = await window.api.fetchGithubWork({ repo, query: q, token: githubToken || undefined })
        if (id !== reqId.current) return
        setItems(result.items)
        setTotal(result.total)
      } catch (err) {
        if (id !== reqId.current) return
        setItems([])
        setTotal(0)
        setError(err instanceof Error ? err.message : 'Failed to load GitHub work.')
      } finally {
        if (id === reqId.current) setLoading(false)
      }
    },
    [repo, githubToken]
  )

  // Re-derive the canonical query and refetch whenever the tab/scope change
  // (Projects has no search API — it links out to github.com instead).
  useEffect(() => {
    if (tab === 'projects') {
      reqId.current++
      setItems([])
      setTotal(0)
      setError(null)
      setLoading(false)
      return
    }
    const q = buildQuery(tab, scope)
    setQuery(q)
    void runFetch(q)
  }, [tab, scope, runFetch])

  const repoUrl = repo ? `https://github.com/${repo}` : undefined
  const newItemUrl = repo
    ? tab === 'prs'
      ? `${repoUrl}/compare`
      : `${repoUrl}/issues/new`
    : undefined

  const submit = (): void => {
    if (tab !== 'projects') void runFetch(query)
  }

  const saveToken = (): void => {
    setGithubToken(tokenDraft)
    setTokenOpen(false)
    setTokenDraft('')
  }

  return (
    <div className="tasks-panel">
      <header className="tasks-head">
        <button className="tasks-icon-btn" title="Close Tasks" onClick={() => toggleTasks(false)}>
          <svg viewBox="0 0 16 16" width="15" height="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
        <span className="tasks-icon-btn active" title="GitHub">
          <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
            <path d="M8 .2a8 8 0 0 0-2.5 15.6c.4.07.55-.17.55-.38v-1.3c-2.2.48-2.67-1.06-2.67-1.06-.36-.92-.88-1.16-.88-1.16-.72-.5.05-.48.05-.48.8.06 1.22.82 1.22.82.71 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.75-.2-3.6-.88-3.6-3.9 0-.86.3-1.57.82-2.12-.08-.2-.36-1 .08-2.1 0 0 .67-.21 2.2.8a7.6 7.6 0 0 1 4 0c1.52-1.02 2.19-.8 2.19-.8.44 1.1.16 1.9.08 2.1.51.55.82 1.26.82 2.12 0 3.03-1.85 3.7-3.61 3.9.29.24.54.72.54 1.46v2.16c0 .21.15.46.55.38A8 8 0 0 0 8 .2Z" />
          </svg>
        </span>
        <button
          className="tasks-icon-btn"
          title={repoUrl ? 'Open repository on GitHub' : 'No GitHub remote'}
          disabled={!repoUrl}
          onClick={() => repoUrl && openExternal(repoUrl)}
        >
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 2.5c2.2 1.8 2.2 6.4 0 11-2.2-4.6-2.2-9.2 0-11Z" />
            <path d="M8 2.5c2.4.3 4.3 1.6 4.8 3.5M8 2.5C5.6 2.8 3.7 4.1 3.2 6" />
            <circle cx="8" cy="6.5" r="1.1" />
            <path d="M6 12.5 4.5 14M10 12.5 11.5 14" />
          </svg>
        </button>
        <span className="tasks-context">
          {repo ? (
            <>
              GitHub · <strong>{repo}</strong>
              {' · '}
              {total} {tab === 'prs' ? 'PRs' : tab === 'projects' ? 'projects' : 'issues'}
            </>
          ) : (
            'GitHub · no repository'
          )}
        </span>
      </header>

      <div className="tasks-tabs">
        <div className="seg">
          <button className={tab === 'issues' ? 'on' : ''} onClick={() => setTab('issues')}>
            Issues
          </button>
          <button className={tab === 'prs' ? 'on' : ''} onClick={() => setTab('prs')}>
            PRs
          </button>
          <button className={tab === 'projects' ? 'on' : ''} onClick={() => setTab('projects')}>
            Projects
          </button>
        </div>
        <span className="tasks-allproj">All projects</span>
        <button
          className="tasks-icon-btn ghost"
          title={repoUrl ? 'Open on GitHub' : 'No GitHub remote'}
          disabled={!repoUrl}
          onClick={() => repoUrl && openExternal(tab === 'prs' ? `${repoUrl}/pulls` : `${repoUrl}/issues`)}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 3H3.5v9.5H13V10" />
            <path d="M9 3h4v4M13 3l-5.5 5.5" />
          </svg>
        </button>
      </div>

      {tab !== 'projects' && (
        <>
          <div className="tasks-scope">
            <div className="seg">
              <button className={scope === 'open' ? 'on' : ''} onClick={() => setScope('open')}>
                Open
              </button>
              <button className={scope === 'assigned' ? 'on' : ''} onClick={() => setScope('assigned')}>
                Assigned to me
              </button>
            </div>
          </div>

          <div className="tasks-toolbar">
            <button className="tasks-filter-btn" title="Filters">
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
                <path d="M2 4h12M4 8h8M6 12h4" />
              </svg>
              Filters
            </button>
            <div className="tasks-search">
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
                <circle cx="7" cy="7" r="4.2" />
                <path d="M10.2 10.2 14 14" />
              </svg>
              <input
                value={query}
                placeholder="is:issue is:open"
                spellCheck={false}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
              {query && (
                <button
                  className="tasks-clear"
                  title="Clear query"
                  onClick={() => {
                    setQuery('')
                    void runFetch('')
                  }}
                >
                  <svg viewBox="0 0 16 16" width="12" height="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </button>
              )}
            </div>
            <button
              className="tasks-icon-btn ghost"
              title={newItemUrl ? `New ${tab === 'prs' ? 'pull request' : 'issue'}` : 'No GitHub remote'}
              disabled={!newItemUrl}
              onClick={() => newItemUrl && openExternal(newItemUrl)}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                <path d="M8 3v10M3 8h10" />
              </svg>
            </button>
            <button className="tasks-icon-btn ghost" title="Refresh" disabled={loading} onClick={submit}>
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={loading ? 'spin' : ''} aria-hidden="true">
                <path d="M13 3v3h-3" />
                <path d="M13 6A5.5 5.5 0 1 0 13.5 9" />
              </svg>
            </button>
          </div>

          {!githubToken && (
            <div className="tasks-token-bar">
              {tokenOpen ? (
                <>
                  <input
                    type="password"
                    autoFocus
                    placeholder="GitHub personal access token (repo scope)"
                    value={tokenDraft}
                    onChange={(e) => setTokenDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveToken()}
                  />
                  <button className="tasks-token-save" onClick={saveToken} disabled={!tokenDraft.trim()}>
                    Save
                  </button>
                  <button className="tasks-token-cancel" onClick={() => setTokenOpen(false)}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span>Connect a token for private repos, “Assigned to me”, and higher rate limits.</span>
                  <button className="tasks-token-connect" onClick={() => setTokenOpen(true)}>
                    Add token
                  </button>
                </>
              )}
            </div>
          )}
          {githubToken && (
            <div className="tasks-token-bar connected">
              <span>Connected with a GitHub token.</span>
              <button className="tasks-token-cancel" onClick={() => setGithubToken('')}>
                Disconnect
              </button>
            </div>
          )}

          <div className="tasks-table">
            <div className="tasks-row tasks-row-head">
              <span>ID</span>
              <span>TITLE / CONTEXT</span>
              <span>ASSIGNEES</span>
              <span>STATUS</span>
              <span>UPDATED</span>
            </div>
            <div className="tasks-body">
              {loading && <div className="tasks-empty">Loading GitHub work…</div>}
              {!loading && error && (
                <div className="tasks-empty">
                  <div className="tasks-empty-title">Couldn’t load GitHub work</div>
                  <div className="tasks-empty-sub">{error}</div>
                </div>
              )}
              {!loading && !error && !repo && (
                <div className="tasks-empty">
                  <div className="tasks-empty-title">No GitHub repository</div>
                  <div className="tasks-empty-sub">Open a project with a GitHub remote to see its work.</div>
                </div>
              )}
              {!loading && !error && repo && items.length === 0 && (
                <div className="tasks-empty">
                  <div className="tasks-empty-title">No matching GitHub work</div>
                  <div className="tasks-empty-sub">Change the query or clear it.</div>
                </div>
              )}
              {!loading &&
                !error &&
                items.map((item) => {
                  const status = statusLabel(item)
                  return (
                    <button key={item.id} className="tasks-row tasks-row-item" onClick={() => openExternal(item.url)}>
                      <span className="t-id">#{item.number}</span>
                      <span className="t-title">
                        <span className={`t-kind ${item.kind}`} aria-hidden="true" />
                        <span className="t-title-text">{item.title}</span>
                      </span>
                      <span className="t-assignees">
                        {item.assignees.length === 0 ? (
                          <span className="t-none">—</span>
                        ) : (
                          item.assignees.slice(0, 3).map((a) => (
                            <img key={a.login} className="t-avatar" src={a.avatarUrl} alt={a.login} title={a.login} />
                          ))
                        )}
                      </span>
                      <span className={`t-status tone-${status.tone}`}>{status.text}</span>
                      <span className="t-updated">{relativeTime(item.updatedAt)}</span>
                    </button>
                  )
                })}
            </div>
          </div>
        </>
      )}

      {tab === 'projects' && (
        <div className="tasks-table">
          <div className="tasks-body">
            <div className="tasks-empty">
              <div className="tasks-empty-title">Projects live on GitHub</div>
              <div className="tasks-empty-sub">Project boards aren’t synced here yet — open them on github.com.</div>
              {repoUrl && (
                <button className="tasks-token-connect" onClick={() => openExternal(`${repoUrl}/projects`)}>
                  Open projects
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
