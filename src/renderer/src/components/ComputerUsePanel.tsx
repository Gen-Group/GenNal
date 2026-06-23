import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useStore } from '../store'
import type { ComputerUseScreenshot, ComputerUseSetup } from '../../../shared/types'

const ENABLED_STORAGE = 'gennal.computerUse.enabled'

function loadEnabled(): boolean {
  try {
    return window.localStorage.getItem(ENABLED_STORAGE) === 'true'
  } catch {
    return false
  }
}

// Keys offered as one-tap shortcuts, mapped to Windows SendKeys syntax.
const QUICK_KEYS: { label: string; keys: string }[] = [
  { label: 'Enter', keys: '{ENTER}' },
  { label: 'Tab', keys: '{TAB}' },
  { label: 'Esc', keys: '{ESC}' },
  { label: 'Backspace', keys: '{BACKSPACE}' },
  { label: 'Win', keys: '^{ESC}' },
  { label: 'Copy', keys: '^c' },
  { label: 'Paste', keys: '^v' },
  { label: 'Alt+F4', keys: '%{F4}' }
]

export default function ComputerUsePanel(): JSX.Element {
  const toggleComputerUse = useStore((s) => s.toggleComputerUse)
  const startComputerUseSession = useStore((s) => s.startComputerUseSession)
  const models = useStore((s) => s.models)
  const aiModels = useMemo(() => models.filter((m) => m.id !== 'custom'), [models])

  const [setup, setSetup] = useState<ComputerUseSetup | null>(null)
  const [shot, setShot] = useState<ComputerUseScreenshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(loadEnabled)
  const [modelId, setModelId] = useState('')
  const [typeText, setTypeText] = useState('')
  const [copied, setCopied] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  const supported = setup?.supported ?? false

  useEffect(() => {
    void window.api.computerUse
      .setup()
      .then(setSetup)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not initialise Computer Use.'))
  }, [])

  // Default the model picker to the first AI model once they load.
  useEffect(() => {
    if (!modelId && aiModels.length > 0) setModelId(aiModels[0].id)
  }, [aiModels, modelId])

  const setEnabledPersist = (value: boolean): void => {
    setEnabled(value)
    try {
      window.localStorage.setItem(ENABLED_STORAGE, String(value))
    } catch {
      /* ignore storage errors */
    }
  }

  const capture = useCallback(async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      setShot(await window.api.computerUse.screenshot())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Screen capture failed.')
    } finally {
      setBusy(false)
    }
  }, [])

  // Map a click on the (scaled) preview to real screen pixels, move+click there,
  // then re-capture so the result is visible.
  const onPreviewClick = async (e: MouseEvent<HTMLImageElement>): Promise<void> => {
    if (!enabled || !shot) return
    const img = imgRef.current
    if (!img) return
    const rect = img.getBoundingClientRect()
    const x = Math.round(((e.clientX - rect.left) / rect.width) * shot.width)
    const y = Math.round(((e.clientY - rect.top) / rect.height) * shot.height)
    setBusy(true)
    try {
      await window.api.computerUse.perform({ kind: 'click', x, y, button: 'left' })
      await new Promise((r) => window.setTimeout(r, 250))
      setShot(await window.api.computerUse.screenshot())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Click failed.')
    } finally {
      setBusy(false)
    }
  }

  const sendType = async (): Promise<void> => {
    if (!enabled || !typeText) return
    setBusy(true)
    try {
      await window.api.computerUse.perform({ kind: 'type', text: typeText })
      setTypeText('')
      await capture()
    } finally {
      setBusy(false)
    }
  }

  const sendKey = async (keys: string): Promise<void> => {
    if (!enabled) return
    await window.api.computerUse.perform({ kind: 'key', keys })
    await capture()
  }

  const copyTool = (): void => {
    if (!setup) return
    window.api.writeClipboardText(setup.toolPath)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  const launchSession = (): void => {
    if (!setup || !modelId) return
    startComputerUseSession(modelId, setup.toolPath)
  }

  return (
    <div className="cu-panel">
      <header className="tasks-head">
        <button className="tasks-icon-btn" title="Close Computer Use" onClick={() => toggleComputerUse(false)}>
          <svg viewBox="0 0 16 16" width="15" height="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
        <span className="tasks-icon-btn active" title="Computer Use">
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="3" width="12" height="8" rx="1.3" />
            <path d="M6 13.5h4M8 11v2.5" />
            <circle cx="8" cy="7" r="1.4" />
          </svg>
        </span>
        <span className="tasks-context">
          Computer Use · <strong>{supported ? 'desktop control ready' : 'unsupported OS'}</strong>
        </span>
        <button className="tasks-icon-btn ghost" title="Take a screenshot" disabled={!supported || busy} onClick={() => void capture()}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="4" width="12" height="9" rx="1.5" />
            <circle cx="8" cy="8.5" r="2.2" />
            <path d="M5.5 4l1-1.5h3l1 1.5" />
          </svg>
        </button>
      </header>

      <p className="cu-intro">
        Let an AI agent operate this computer through the existing CLI terminals: it takes screenshots
        and drives the mouse and keyboard. Actions run on your real desktop — keep an eye on it and turn
        control off when you’re done.
      </p>

      <div className="cu-body">
        {!supported && (
          <div className="tasks-empty">
            <div className="tasks-empty-title">Desktop control is Windows-only in this build</div>
            <div className="tasks-empty-sub">
              {setup ? `Detected platform: ${setup.platform}.` : 'Checking this machine…'}
            </div>
          </div>
        )}

        {supported && (
          <>
            <section className="cu-card cu-arm">
              <div>
                <h3>Enable desktop control</h3>
                <p>Required before any click, type, or key is sent to the real desktop.</p>
              </div>
              <button
                className={`task-toggle ${enabled ? 'on' : ''}`}
                aria-pressed={enabled}
                aria-label="Enable desktop control"
                onClick={() => setEnabledPersist(!enabled)}
              >
                <span />
              </button>
            </section>

            <section className="cu-card cu-launch">
              <div>
                <h3>Start AI control session</h3>
                <p>Opens a terminal running the selected CLI, briefed to drive the desktop with the tool below.</p>
              </div>
              <div className="cu-launch-row">
                <select
                  className="settings-select"
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  aria-label="Model to run"
                >
                  {aiModels.length === 0 && <option value="">No AI models</option>}
                  {aiModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <button className="cu-primary" disabled={!modelId} onClick={launchSession}>
                  Start session
                </button>
              </div>
            </section>

            <section className="cu-preview-wrap">
              <div className="cu-preview-head">
                <span>Live screen</span>
                {shot && (
                  <span className="cu-dim">
                    {shot.width}×{shot.height}
                    {enabled ? ' · click to click' : ' · enable control to interact'}
                  </span>
                )}
              </div>
              {shot ? (
                <div className={`cu-preview-stage ${enabled ? 'live' : 'idle'}`} aria-busy={busy}>
                  <img
                    ref={imgRef}
                    className={`cu-preview ${enabled ? 'live' : ''}`}
                    src={shot.dataUrl}
                    alt="Desktop screenshot"
                    onClick={(e) => void onPreviewClick(e)}
                  />
                  {busy && (
                    <div className="cu-preview-busy" aria-hidden="true">
                      <span className="cu-spinner" />
                    </div>
                  )}
                </div>
              ) : (
                <button className="cu-preview-empty" disabled={busy} onClick={() => void capture()}>
                  {busy ? 'Capturing…' : 'Take a screenshot'}
                </button>
              )}
            </section>

            <section className={`cu-card cu-controls ${enabled ? '' : 'is-disabled'}`}>
              <div className="cu-control-row">
                <input
                  className="settings-text-input"
                  placeholder="Type text on the desktop…"
                  value={typeText}
                  disabled={!enabled}
                  onChange={(e) => setTypeText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void sendType()
                  }}
                />
                <button className="cu-primary" disabled={!enabled || !typeText} onClick={() => void sendType()}>
                  Type
                </button>
              </div>
              <div className="cu-keys">
                {QUICK_KEYS.map((k) => (
                  <button key={k.label} disabled={!enabled} onClick={() => void sendKey(k.keys)}>
                    {k.label}
                  </button>
                ))}
              </div>
              <div className="cu-scroll">
                <span>Scroll</span>
                <button disabled={!enabled} onClick={() => void window.api.computerUse.perform({ kind: 'scroll', amount: 3 }).then(() => capture())}>
                  ↑ Up
                </button>
                <button disabled={!enabled} onClick={() => void window.api.computerUse.perform({ kind: 'scroll', amount: -3 }).then(() => capture())}>
                  ↓ Down
                </button>
              </div>
            </section>

            {setup && (
              <section className="cu-card cu-tool">
                <div>
                  <h3>Agent control tool</h3>
                  <p>The CLI agent drives the desktop by running this in PowerShell. A started session is briefed automatically.</p>
                  <code className="cu-tool-path">{`& "${setup.toolPath}" screenshot`}</code>
                </div>
                <button className="cu-ghost" onClick={copyTool}>
                  {copied ? 'Copied' : 'Copy path'}
                </button>
              </section>
            )}

            {error && <div className="cu-error">{error}</div>}
          </>
        )}
      </div>
    </div>
  )
}
