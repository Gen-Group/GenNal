import { useMemo, useState } from 'react'
import {
  useStore,
  AUTOMATION_TEMPLATES,
  AUTOMATION_SCHEDULE_LABELS,
  type AutomationSchedule,
  type AutomationRun
} from '../store'

type DetailTab = 'overview' | 'runs'

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatNext(ms: number | undefined): string {
  if (!ms) return 'Not scheduled'
  const diff = ms - Date.now()
  if (diff <= 0) return 'Due now'
  const mins = Math.round(diff / 60000)
  if (mins < 60) return `in ${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `in ${hours}h`
  return `in ${Math.round(hours / 24)}d`
}

function duration(run: AutomationRun): string {
  if (!run.finishedAt) return ''
  const ms = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ''
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 60000)}m`
}

const SCHEDULES: AutomationSchedule[] = ['hourly', 'daily', 'weekday', 'weekly']

export default function AutomationsPanel(): JSX.Element {
  const toggleAutomations = useStore((s) => s.toggleAutomations)
  const automations = useStore((s) => s.automations)
  const automationRuns = useStore((s) => s.automationRuns)
  const models = useStore((s) => s.models)
  const addAutomationFromTemplate = useStore((s) => s.addAutomationFromTemplate)
  const addBlankAutomation = useStore((s) => s.addBlankAutomation)
  const updateAutomation = useStore((s) => s.updateAutomation)
  const removeAutomation = useStore((s) => s.removeAutomation)
  const runAutomation = useStore((s) => s.runAutomation)
  const tickAutomations = useStore((s) => s.tickAutomations)

  const [selectedId, setSelectedId] = useState<string | null>(automations[0]?.id ?? null)
  const [tab, setTab] = useState<DetailTab>('overview')
  const [expandedRun, setExpandedRun] = useState<string | null>(null)

  const selected = automations.find((a) => a.id === selectedId) ?? null
  const runs = useMemo(
    () => (selected ? automationRuns.filter((r) => r.automationId === selected.id) : []),
    [automationRuns, selected]
  )
  const running = runs.some((r) => r.status === 'running')

  const createFromTemplate = (index: number): void => {
    const id = addAutomationFromTemplate(AUTOMATION_TEMPLATES[index])
    setSelectedId(id)
    setTab('overview')
  }
  const createBlank = (): void => {
    const id = addBlankAutomation()
    setSelectedId(id)
    setTab('overview')
  }
  const onDelete = (): void => {
    if (!selected) return
    removeAutomation(selected.id)
    setSelectedId((cur) => {
      const remaining = automations.filter((a) => a.id !== selected.id)
      return cur === selected.id ? remaining[0]?.id ?? null : cur
    })
  }

  return (
    <div className="auto-panel">
      <header className="auto-head">
        <button className="tasks-icon-btn" title="Close Automations" onClick={() => toggleAutomations(false)}>
          <svg viewBox="0 0 16 16" width="15" height="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
        <span className="auto-title">
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
            <path d="M2.5 6.5h11M5.5 2.2v2.4M10.5 2.2v2.4" />
            <circle cx="8" cy="10" r="1.6" />
          </svg>
          Automations
        </span>
        <button className="tasks-icon-btn" title="New automation" onClick={createBlank}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
        <button className="tasks-icon-btn ghost auto-head-refresh" title="Check schedule now" onClick={() => tickAutomations()}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M13 3v3h-3" />
            <path d="M13 6A5.5 5.5 0 1 0 13.5 9" />
          </svg>
        </button>
      </header>

      <div className="auto-body">
        <aside className="auto-templates">
          {automations.length > 0 && (
            <>
              <div className="auto-sec-title">Your automations</div>
              <div className="auto-list">
                {automations.map((a) => (
                  <button
                    key={a.id}
                    className={`auto-list-item ${selectedId === a.id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedId(a.id)
                      setTab('overview')
                    }}
                  >
                    <span className={`auto-dot ${a.enabled ? 'on' : ''}`} aria-hidden="true" />
                    <span className="auto-list-name">{a.name}</span>
                    <span className="auto-list-meta">{AUTOMATION_SCHEDULE_LABELS[a.schedule]}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="auto-sec-title">Start from a template</div>
          {AUTOMATION_TEMPLATES.map((t, i) => (
            <button key={t.name} className="auto-template" onClick={() => createFromTemplate(i)}>
              <span className="auto-template-cat">{t.category}</span>
              <span className="auto-template-name">{t.name}</span>
              <span className="auto-template-desc">{t.description}</span>
            </button>
          ))}
          <button className="auto-addnew" onClick={createBlank}>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M8 3v10M3 8h10" />
            </svg>
            Add new
          </button>
        </aside>

        <section className="auto-detail">
          {!selected ? (
            <div className="auto-empty">
              <div className="auto-tabs">
                <button className="on">Overview</button>
                <button className="muted">Runs 0</button>
              </div>
              <div className="auto-empty-msg">Create an automation to start scheduling agent work.</div>
            </div>
          ) : (
            <>
              <div className="auto-tabs">
                <button className={tab === 'overview' ? 'on' : ''} onClick={() => setTab('overview')}>
                  Overview
                </button>
                <button className={tab === 'runs' ? 'on' : ''} onClick={() => setTab('runs')}>
                  Runs <span className="auto-runs-count">{runs.length}</span>
                </button>
              </div>

              {tab === 'overview' ? (
                <div className="auto-overview">
                  <div className="auto-field">
                    <label>Name</label>
                    <input
                      value={selected.name}
                      onChange={(e) => updateAutomation(selected.id, { name: e.target.value })}
                    />
                  </div>

                  <div className="auto-field-row">
                    <div className="auto-field">
                      <label>Schedule</label>
                      <select
                        value={selected.schedule}
                        onChange={(e) =>
                          updateAutomation(selected.id, { schedule: e.target.value as AutomationSchedule })
                        }
                      >
                        {SCHEDULES.map((s) => (
                          <option key={s} value={s}>
                            {AUTOMATION_SCHEDULE_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="auto-field">
                      <label>Model</label>
                      <select
                        value={selected.modelId}
                        onChange={(e) => updateAutomation(selected.id, { modelId: e.target.value })}
                      >
                        {models.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="auto-field">
                    <label>Prompt</label>
                    <textarea
                      rows={6}
                      placeholder="What should the agent do on each run?"
                      value={selected.prompt}
                      onChange={(e) => updateAutomation(selected.id, { prompt: e.target.value })}
                    />
                  </div>

                  <label className="auto-toggle">
                    <input
                      type="checkbox"
                      checked={selected.enabled}
                      onChange={(e) => updateAutomation(selected.id, { enabled: e.target.checked })}
                    />
                    <span>Enabled</span>
                    <span className="auto-next">
                      {selected.enabled ? `Next run ${formatNext(selected.nextRunAt)}` : 'Paused'}
                    </span>
                  </label>

                  <div className="auto-actions">
                    <button
                      className="auto-run-btn"
                      disabled={running || !selected.prompt.trim()}
                      onClick={() => {
                        runAutomation(selected.id, 'manual')
                        setTab('runs')
                      }}
                    >
                      {running ? 'Running…' : 'Run now'}
                    </button>
                    <button className="auto-delete-btn" onClick={onDelete}>
                      Delete
                    </button>
                  </div>
                  {!selected.prompt.trim() && (
                    <div className="auto-hint">Add a prompt to enable runs.</div>
                  )}
                </div>
              ) : (
                <div className="auto-runs">
                  {runs.length === 0 ? (
                    <div className="auto-empty-msg">No runs yet. Use “Run now” or wait for the schedule.</div>
                  ) : (
                    runs.map((run) => (
                      <div key={run.id} className={`auto-run ${expandedRun === run.id ? 'open' : ''}`}>
                        <button
                          className="auto-run-head"
                          onClick={() => setExpandedRun((cur) => (cur === run.id ? null : run.id))}
                        >
                          <span className={`auto-run-status status-${run.status}`}>{run.status}</span>
                          <span className="auto-run-time">{formatTime(run.startedAt)}</span>
                          <span className="auto-run-trigger">{run.trigger}</span>
                          <span className="auto-run-dur">{duration(run)}</span>
                        </button>
                        {expandedRun === run.id && (
                          <pre className="auto-run-output">
                            {run.error
                              ? run.error
                              : run.output.trim() || (run.status === 'running' ? 'Running…' : 'No output.')}
                          </pre>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
