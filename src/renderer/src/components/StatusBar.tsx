import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import HelpMenu from './HelpMenu'
import { APP_VERSION } from '../version'
import type { CliUsage, CliUsageLimit } from '../../../shared/types'

/**
 * Which CLI's live-quota data backs a model. Built-ins map to themselves;
 * wrappers around a known CLI (e.g. a custom "claude --resume") resolve to it.
 * Mirrors UsageDetail.usageKey, but only the three CLIs that report live limits.
 */
function usageKey(m: { id: string; command: string; tag: string }): 'claude' | 'codex' | 'gemini' | null {
  if (m.id === 'claude' || m.id === 'codex' || m.id === 'gemini') return m.id
  const hay = `${m.id} ${m.command} ${m.tag}`.toLowerCase()
  if (hay.includes('claude')) return 'claude'
  if (hay.includes('codex') || hay.includes('gpt')) return 'codex'
  if (hay.includes('gemini')) return 'gemini'
  return null
}

/** Tone keyed on how little quota is left (used %): the redder, the closer to the cap. */
function limitTone(usedPct: number): string {
  if (usedPct >= 95) return 'crit'
  if (usedPct >= 80) return 'warn'
  return 'ok'
}

/** Compact window name for the bar, e.g. "5h" / "wk" / "1d". */
function shortWindow(l: CliUsageLimit): string {
  const m = l.windowMinutes
  if (m === 300) return '5h'
  if (m === 10_080) return 'wk'
  if (m && m % 1440 === 0) return `${m / 1440}d`
  if (m && m % 60 === 0) return `${m / 60}h`
  return l.label.split('·')[0].trim().toLowerCase() || 'now'
}

/** Full window name for the popover, e.g. "Session" / "Weekly". */
function windowTitle(l: CliUsageLimit): string {
  if (l.windowMinutes === 300) return 'Session'
  if (l.windowMinutes === 10_080) return 'Weekly'
  return l.label
}

/**
 * Pick the windows worth showing per provider: the short rolling window (5h)
 * and the primary weekly window. Falls back to whatever the CLI reported.
 */
function pickWindows(limits: CliUsageLimit[]): CliUsageLimit[] {
  const short = limits.find((l) => l.windowMinutes === 300)
  const weekly =
    limits.find((l) => l.windowMinutes === 10_080 && /all models/i.test(l.label)) ??
    limits.find((l) => l.windowMinutes === 10_080)
  const picked = [short, weekly].filter((l): l is CliUsageLimit => Boolean(l))
  return picked.length > 0 ? picked : limits.slice(0, 2)
}

/** Whole quota consumed (0–100) — drives tone (how close to the cap). */
function usedPct(l: CliUsageLimit): number {
  return Math.max(0, Math.min(100, Math.round(l.usedPercent)))
}

/** Whole quota remaining (0–100) — the headline figure shown to the user. */
function leftPct(l: CliUsageLimit): number {
  return Math.max(0, Math.min(100, Math.round(100 - l.usedPercent)))
}

/** "3h 15m" / "6d 10h" — time until a quota window resets. */
function fmtResetsIn(iso?: string): string {
  if (!iso) return ''
  const when = new Date(iso).getTime()
  if (Number.isNaN(when)) return ''
  const mins = Math.floor((when - Date.now()) / 60_000)
  if (mins <= 0) return 'now'
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m}m`
  return `${m}m`
}

/** "just now" / "3 min ago" — how stale the fetched usage is. */
function fmtUpdated(fetchedAt: number): string {
  const secs = Math.floor((Date.now() - fetchedAt) / 1000)
  if (secs < 45) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  return `${hrs}h ago`
}

type ProviderKey = 'claude' | 'codex' | 'gemini'

interface UsageProvider {
  key: ProviderKey
  name: string
  accent: string
}

function ProviderGlyph({ kind }: { kind: ProviderKey }): JSX.Element {
  if (kind === 'claude') {
    // Anthropic sunburst.
    return (
      <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true">
        <path d="M8 0.8l1.05 4.05L12.2 2.4 10.6 6 14.7 5.4 11.3 8l3.4 2.6-4.1-.6 1.6 3.6-3.15-2.45L8 15.2l-1.05-4.05L3.8 13.6 5.4 10 1.3 10.6 4.7 8 1.3 5.4l4.1.6L3.8 2.4l3.15 2.45z" />
      </svg>
    )
  }
  if (kind === 'codex') {
    // OpenAI-style knot, simplified.
    return (
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <circle cx="8" cy="5" r="2.1" />
        <circle cx="5" cy="9.5" r="2.1" />
        <circle cx="11" cy="9.5" r="2.1" />
      </svg>
    )
  }
  // Gemini spark.
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true">
      <path d="M8 1c.4 2.7 1.3 3.6 4 4-2.7.4-3.6 1.3-4 4-.4-2.7-1.3-3.6-4-4 2.7-.4 3.6-1.3 4-4z" />
    </svg>
  )
}

/** Detailed quota popover anchored above a provider chip. */
function UsagePopover({
  provider,
  usage,
  fetchedAt,
  onOpenDetail,
  onClose
}: {
  provider: UsageProvider
  usage: CliUsage
  fetchedAt: number
  onOpenDetail: () => void
  onClose: () => void
}): JSX.Element {
  const windows = pickWindows(usage.limits ?? [])
  const account = usage.account
  const accountName = account?.name || account?.email || `${provider.name} Account`
  const maxMsgs = Math.max(1, ...usage.periods.map((p) => p.messages))

  return (
    <div className="sb-pop" role="dialog" aria-label={`${provider.name} usage`}>
      <div className="sb-pop-head">
        <span className="sb-pop-glyph" style={{ color: provider.accent }}>
          <ProviderGlyph kind={provider.key} />
        </span>
        <div className="sb-pop-id">
          <strong>{provider.name}</strong>
          <span className="sb-pop-updated">Updated {fmtUpdated(fetchedAt)}</span>
        </div>
        {account?.plan && <span className="sb-pop-plan">{account.plan}</span>}
      </div>

      <div className="sb-pop-windows">
        {windows.map((l) => {
          const left = leftPct(l)
          const tone = limitTone(usedPct(l))
          const reset = fmtResetsIn(l.resetsAt)
          return (
            <div className="sb-pop-win" key={l.label}>
              <div className="sb-pop-win-title">{windowTitle(l)}</div>
              <div className="sb-pop-win-bar"><span className={tone} style={{ width: `${left}%` }} /></div>
              <div className="sb-pop-win-foot">
                <span className={`sb-pop-left ${tone}`}>{left}% left</span>
                {reset && <span className="sb-pop-reset">Resets in {reset}</span>}
              </div>
            </div>
          )
        })}

        {/* No rate limits (e.g. Gemini): show recorded activity instead. */}
        {windows.length === 0 &&
          usage.periods.map((p) => {
            const pct = Math.round((p.messages / maxMsgs) * 100)
            return (
              <div className="sb-pop-win" key={p.label}>
                <div className="sb-pop-win-foot" style={{ marginTop: 0, marginBottom: 6 }}>
                  <span className="sb-pop-win-title" style={{ margin: 0 }}>{p.label}</span>
                  <span className="sb-pop-reset">{p.messages.toLocaleString()} {p.unit || 'msgs'}</span>
                </div>
                <div className="sb-pop-win-bar"><span className="ok" style={{ width: `${pct}%`, background: provider.accent }} /></div>
              </div>
            )
          })}

        {windows.length === 0 && usage.periods.length === 0 && (
          <div className="sb-pop-empty">{usage.note || 'No usage data on this device yet.'}</div>
        )}
      </div>

      <button className="sb-pop-row" onClick={onOpenDetail} title={accountName}>
        <span className="sb-pop-row-cap">{provider.name} Account</span>
        <span className="sb-pop-row-main">
          {account?.name || account?.email || 'System default'}
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 3l5 5-5 5" />
          </svg>
        </span>
      </button>

      <button className="sb-pop-manage" onClick={onOpenDetail}>Manage Accounts…</button>

      <button className="sb-pop-close" aria-label="Close" onClick={onClose}>
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  )
}

/** One provider's live quota: icon, max-window bar, and per-window percentages. */
function ProviderChip({
  provider,
  usage,
  fetchedAt,
  open,
  onToggle,
  onOpenDetail
}: {
  provider: UsageProvider
  usage: CliUsage
  fetchedAt: number
  open: boolean
  onToggle: () => void
  onOpenDetail: () => void
}): JSX.Element {
  const windows = pickWindows(usage.limits ?? [])
  const hasWindows = windows.length > 0
  const worstUsed = hasWindows ? Math.max(0, ...windows.map(usedPct)) : 0
  const tone = limitTone(worstUsed)
  return (
    <span className="sb-usage-wrap">
      <button
        className={`sb-usage ${open ? 'open' : ''}`}
        title={`${provider.name} — click for usage`}
        onClick={onToggle}
      >
        <span className="sb-usage-glyph" style={{ color: provider.accent }}><ProviderGlyph kind={provider.key} /></span>
        {hasWindows ? (
          <>
            <span className="sb-usage-bar"><span className={tone} style={{ width: `${worstUsed}%` }} /></span>
            <span className="sb-usage-wins">
              {windows.map((l, i) => (
                <span key={l.label}>
                  {i > 0 && <span className="sb-usage-dot"> · </span>}
                  <b className={`sb-usage-pct ${limitTone(usedPct(l))}`}>{leftPct(l)}%</b> {shortWindow(l)}
                </span>
              ))}
            </span>
          </>
        ) : (
          // CLIs without rate limits (e.g. Gemini): just name it; detail lives in the popover.
          <span className="sb-usage-wins sb-usage-name">{provider.name}</span>
        )}
      </button>
      {open && (
        <UsagePopover
          provider={provider}
          usage={usage}
          fetchedAt={fetchedAt}
          onOpenDetail={onOpenDetail}
          onClose={onToggle}
        />
      )}
    </span>
  )
}

/** Live multi-provider usage strip — one chip per open model that reports quotas. */
function UsageStrip(): JSX.Element | null {
  const sessions = useStore((s) => s.sessions)
  const openUsage = useStore((s) => s.openUsage)
  const wrapRef = useRef<HTMLSpanElement>(null)

  // One chip per distinct CLI among the *open* sessions, in the order opened.
  // Opening another model of the same CLI reuses its chip; a new CLI adds one.
  const providers = useMemo<UsageProvider[]>(() => {
    const seen = new Set<ProviderKey>()
    const out: UsageProvider[] = []
    const named: Record<ProviderKey, string> = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini' }
    for (const s of sessions) {
      if (!s.command.trim()) continue
      const key = usageKey({ id: s.modelId, command: s.command, tag: s.tag })
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push({ key, name: named[key], accent: s.accent })
    }
    return out
  }, [sessions])

  const [data, setData] = useState<Record<string, CliUsage>>({})
  const [fetchedAt, setFetchedAt] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [open, setOpen] = useState<ProviderKey | null>(null)

  const load = useCallback(() => {
    setSpinning(true)
    Promise.all(
      providers.map((p) =>
        window.api
          .getUsage(p.key)
          .then((u) => [p.key, u] as const)
          .catch(() => [p.key, null] as const)
      )
    )
      .then((entries) => {
        const next: Record<string, CliUsage> = {}
        // Keep any provider that has *something* to show: live quota windows,
        // or — for CLIs without rate limits (e.g. Gemini) — recorded activity.
        for (const [key, u] of entries) {
          if (!u) continue
          const hasLimits = Boolean(u.limits && u.limits.length > 0)
          const hasActivity = u.available || u.periods.length > 0
          if (hasLimits || hasActivity) next[key] = u
        }
        setData(next)
        setFetchedAt(Date.now())
      })
      .finally(() => setSpinning(false))
  }, [providers])

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  // Dismiss the popover on outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(null)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const live = providers.filter((p) => data[p.key])
  if (live.length === 0) return null

  return (
    <span className="sb-usage-strip" ref={wrapRef}>
      {live.map((p) => (
        <ProviderChip
          key={p.key}
          provider={p}
          usage={data[p.key]}
          fetchedAt={fetchedAt}
          open={open === p.key}
          onToggle={() => setOpen((cur) => (cur === p.key ? null : p.key))}
          onOpenDetail={() => {
            setOpen(null)
            openUsage(p.key)
          }}
        />
      ))}
      <button
        className={`sb-usage-refresh ${spinning ? 'spin' : ''}`}
        title="Refresh usage"
        aria-label="Refresh usage"
        onClick={load}
        disabled={spinning}
      >
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M13 8a5 5 0 1 1-1.5-3.5M13 2.5V5h-2.5" />
        </svg>
      </button>
    </span>
  )
}

export default function StatusBar(): JSX.Element {
  const stats = useStore((s) => s.stats)
  const sessions = useStore((s) => s.sessions)
  const activeId = useStore((s) => s.activeId)
  const mode = useStore((s) => s.mode)
  const rows = useStore((s) => s.rows)
  const cols = useStore((s) => s.cols)
  const toggleSettings = useStore((s) => s.toggleSettings)
  const active = sessions.find((s) => s.id === activeId)

  return (
    <footer className="statusbar">
      <span className="sb-left">
        <button className="sb-btn" title="Settings" aria-label="Settings" onClick={() => toggleSettings(true)}>
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="8" cy="8" r="2.1" />
            <path d="M8 1.6v1.8M8 12.6v1.8M14.4 8h-1.8M3.4 8H1.6M12.5 3.5l-1.3 1.3M4.8 11.2l-1.3 1.3M12.5 12.5l-1.3-1.3M4.8 4.8 3.5 3.5" />
          </svg>
        </button>
        <HelpMenu />
      </span>
      <span className="sb-item">
        <span className={`sb-dot ${sessions.length > 0 ? 'on' : ''}`} aria-hidden="true" />
        {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
      </span>
      <span className="sb-item">Layout <b className="sb-val">{mode} {rows}×{cols}</b></span>
      <span className="sb-item">UTF-8</span>
      <span className="sb-item">Shell <b className="sb-val">{window.api.shellName}</b></span>
      <UsageStrip />
      <span className="sb-spacer" />
      <span className="sb-item">{active ? <>Model <b className="sb-val">{active.label}</b></> : 'No model'}</span>
      <span className="sb-item">CPU <b className="sb-val">{stats.cpu}%</b></span>
      <span className="sb-item">Mem <b className="sb-val">{(stats.memUsedMB / 1024).toFixed(1)} GB</b></span>
      <span className="sb-item sb-version">v{APP_VERSION}</span>
    </footer>
  )
}
