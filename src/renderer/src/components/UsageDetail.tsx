import { useEffect, useState } from 'react'
import type { CliUsage, CliUsageLimit, ModelDef } from '../../../shared/types'

interface Props {
  model: ModelDef
  onBack: () => void
  onConnect: () => void
}

function fmtDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtNum(n?: number): string {
  return typeof n === 'number' ? n.toLocaleString() : '—'
}

function fmtHour(h?: number): string {
  if (typeof h !== 'number') return '—'
  const period = h < 12 ? 'AM' : 'PM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour} ${period}`
}

/** "resets in 4h 10m · 06/15 20:22" style label for a quota window. */
function resetLabel(iso?: string): string {
  if (!iso) return ''
  const when = new Date(iso)
  if (Number.isNaN(when.getTime())) return ''
  const at = when.toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  const diff = when.getTime() - Date.now()
  if (diff <= 0) return `resets soon · ${at}`
  const mins = Math.floor(diff / 60000)
  const days = Math.floor(mins / 1440)
  const hrs = Math.floor((mins % 1440) / 60)
  const rem = mins % 60
  const parts: string[] = []
  if (days) parts.push(`${days}d`)
  if (hrs) parts.push(`${hrs}h`)
  if (!days) parts.push(`${rem}m`)
  return `resets in ${parts.join(' ')} · ${at}`
}

function limitTone(pct: number): string {
  if (pct >= 95) return 'crit'
  if (pct >= 80) return 'warn'
  return 'ok'
}

/**
 * Which CLI's usage data backs a model. Built-ins map to themselves; user-added
 * models that wrap a known CLI (e.g. a custom "claude --resume") resolve to that
 * CLI so their usage shows real data instead of falling through to "no data".
 */
function usageKey(m: ModelDef): string {
  if (m.id === 'claude' || m.id === 'codex' || m.id === 'gemini') return m.id
  const hay = `${m.id} ${m.command} ${m.tag}`.toLowerCase()
  if (hay.includes('claude')) return 'claude'
  if (hay.includes('codex') || hay.includes('gpt')) return 'codex'
  if (hay.includes('gemini')) return 'gemini'
  return m.id
}

/** "2026-06-29 20:50" — fixed, sortable timestamp used by the Term row. */
function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * The "Term" is the longest reported quota window (e.g. Codex's weekly window):
 * the date it renews and how many whole days remain until then.
 */
function termInfo(limits?: CliUsageLimit[]): { days: number; at: string } | null {
  const withReset = (limits ?? []).filter((l) => l.resetsAt)
  if (withReset.length === 0) return null
  const longest = withReset.reduce((a, b) => ((b.windowMinutes || 0) > (a.windowMinutes || 0) ? b : a))
  const when = new Date(longest.resetsAt as string)
  if (Number.isNaN(when.getTime())) return null
  const days = Math.max(0, Math.ceil((when.getTime() - Date.now()) / 86_400_000))
  return { days, at: fmtDateTime(longest.resetsAt as string) }
}

export default function UsageDetail({ model, onBack, onConnect }: Props): JSX.Element {
  const [usage, setUsage] = useState<CliUsage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = (): void => {
    setLoading(true)
    setError('')
    window.api
      .getUsage(usageKey(model))
      .then((data) => setUsage(data))
      .catch(() => setError('Could not read usage data.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [model.id])

  const account = usage?.account
  const initial = (account?.name || account?.email || model.label).slice(0, 1).toUpperCase()

  const term = termInfo(usage?.limits)
  const t = usage?.totals
  const statTiles: { label: string; value: string }[] = []
  if (t) {
    if (t.sessions != null) statTiles.push({ label: 'Total sessions', value: fmtNum(t.sessions) })
    if (t.messages != null) statTiles.push({ label: 'Total messages', value: fmtNum(t.messages) })
    if (t.toolCalls != null) statTiles.push({ label: 'Tool calls', value: fmtNum(t.toolCalls) })
    if (t.busiestHour != null) statTiles.push({ label: 'Busiest hour', value: fmtHour(t.busiestHour) })
    if (t.firstSession) statTiles.push({ label: 'First session', value: fmtDate(t.firstSession) })
    if (t.lastActive) statTiles.push({ label: 'Last active', value: fmtDate(t.lastActive) })
  }

  return (
    <div className="usage-detail">
      <div className="usage-detail-bar">
        <button className="usage-back" onClick={onBack}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 3 L5 8 L10 13" />
          </svg>
          Back
        </button>
        <button className="usage-refresh" onClick={load} disabled={loading} title="Refresh usage">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M13 8a5 5 0 1 1-1.5-3.5M13 2.5V5h-2.5" />
          </svg>
          Refresh
        </button>
      </div>

      <div className="usage-detail-head">
        <span className="usage-detail-avatar" style={{ background: model.accent }}>{initial}</span>
        <div className="usage-detail-id">
          <div className="usage-detail-name">
            <strong>{account?.name || account?.email || model.label}</strong>
            {account?.plan && <span className="usage-plan-pill">{account.plan}</span>}
          </div>
          <p>{account?.email || model.tag}{usage?.source ? ` · ${usage.source}` : ''}</p>
        </div>
        <span className={`usage-detail-status ${usage?.available ? 'on' : ''}`}>
          <span className="usage-dot" />
          {usage?.available ? 'Signed in' : 'No data'}
        </span>
      </div>

      {loading ? (
        <div className="usage-detail-empty">Reading usage…</div>
      ) : error ? (
        <div className="usage-detail-empty">{error}</div>
      ) : (
        <>
          {usage?.limits && usage.limits.length > 0 && (
            <div className="usage-limits">
              <div className="usage-limits-head">
                <span className="usage-limits-title">Plan usage limits</span>
                {account?.plan && <span className="usage-plan-pill">{account.plan}</span>}
              </div>
              {usage.limits.map((l) => {
                const pct = Math.max(0, Math.min(100, Math.round(l.usedPercent)))
                const tone = limitTone(pct)
                return (
                  <div className="usage-limit" key={l.label}>
                    <div className="usage-limit-top">
                      <span className="usage-limit-label">{l.label}</span>
                      <span className={`usage-limit-pct ${tone}`}>{pct}%</span>
                    </div>
                    <div className="usage-limit-bar"><span className={tone} style={{ width: `${pct}%` }} /></div>
                    {l.resetsAt && <div className="usage-limit-reset">{resetLabel(l.resetsAt)}</div>}
                  </div>
                )
              })}
            </div>
          )}

          {term && (
            <div className="usage-term">
              <span className="usage-term-label">
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2.5 4.5h11v9h-11z M2.5 7h11 M5.5 2.5v3 M10.5 2.5v3" />
                </svg>
                Term
                <span className="usage-term-days">{term.days}d</span>
              </span>
              <span className="usage-term-at">{term.at}</span>
            </div>
          )}

          {usage && usage.periods.length > 0 && (() => {
            const maxMsgs = Math.max(...usage.periods.map((p) => p.messages), 1)
            return (
              <div className="usage-windows">
                {usage.periods.map((p) => {
                  const pct = Math.round((p.messages / maxMsgs) * 100)
                  const sub: string[] = []
                  if (p.sessions > 0) sub.push(`${fmtNum(p.sessions)} sessions`)
                  if (p.toolCalls > 0) sub.push(`${fmtNum(p.toolCalls)} tool calls`)
                  return (
                    <div className="usage-window" key={p.label}>
                      <div className="usage-window-top">
                        <span className="usage-window-label">{p.label}</span>
                        <span className="usage-window-val">{fmtNum(p.messages)} {p.unit || 'msgs'}</span>
                      </div>
                      <div className="usage-window-bar"><span style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${model.accent}b3, ${model.accent})` }} /></div>
                      {sub.length > 0 && <div className="usage-window-sub">{sub.join(' · ')}</div>}
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {usage?.totals && statTiles.length > 0 && (
            <div className="usage-stat-grid">
              {statTiles.map((t) => (
                <div className="usage-stat" key={t.label}><span>{t.label}</span><strong>{t.value}</strong></div>
              ))}
            </div>
          )}

          {account && (account.org || account.memberSince || account.subscriptionSince || account.trialEndsAt) && (
            <div className="usage-account-rows">
              {account.org && <div className="usage-account-row"><span>Organization</span><strong>{account.org}</strong></div>}
              {account.subscriptionSince && <div className="usage-account-row"><span>Subscribed</span><strong>{fmtDate(account.subscriptionSince)}</strong></div>}
              {account.memberSince && <div className="usage-account-row"><span>Member since</span><strong>{fmtDate(account.memberSince)}</strong></div>}
              {account.trialEndsAt && <div className="usage-account-row warn"><span>Trial ends</span><strong>{fmtDate(account.trialEndsAt)}</strong></div>}
            </div>
          )}

          <div className="usage-detail-actions">
            <button className="usage-connect on" onClick={onConnect}>Launch session</button>
          </div>

          {usage?.note && <p className="remote-note">{usage.note}</p>}
        </>
      )}
    </div>
  )
}
