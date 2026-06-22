import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../store'
import type { EmulatorInfo, EmulatorList } from '../../../shared/types'

const ANDROID_DOCS = 'https://developer.android.com/studio/run/managing-avds'
const IOS_DOCS = 'https://developer.apple.com/documentation/xcode/running-your-app-in-simulator-or-on-a-device'

function PlatformGlyph({ platform }: { platform: 'android' | 'ios' }): JSX.Element {
  return platform === 'android' ? (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M4.6 6.1a.55.55 0 0 0-.55.55v3.2a.55.55 0 1 0 1.1 0v-3.2a.55.55 0 0 0-.55-.55Zm6.8 0a.55.55 0 0 0-.55.55v3.2a.55.55 0 1 0 1.1 0v-3.2a.55.55 0 0 0-.55-.55ZM5.7 6v4.3c0 .3.24.55.55.55h.5v1.5a.55.55 0 1 0 1.1 0v-1.5h.9v1.5a.55.55 0 1 0 1.1 0v-1.5h.5a.55.55 0 0 0 .55-.55V6Zm.2-.6h4.6a2.35 2.35 0 0 0-1.2-1.85l.5-.9a.2.2 0 1 0-.35-.2l-.52.93a2.6 2.6 0 0 0-1.97 0l-.52-.93a.2.2 0 1 0-.35.2l.5.9A2.35 2.35 0 0 0 5.9 5.4Zm1.05-.9a.3.3 0 1 1 0-.6.3.3 0 0 1 0 .6Zm2.5 0a.3.3 0 1 1 0-.6.3.3 0 0 1 0 .6Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
      <path d="M10.8 8.5c0-1.3 1-1.95 1.05-1.98-.57-.84-1.46-.95-1.78-.96-.76-.08-1.48.44-1.86.44-.39 0-.98-.43-1.6-.42-.83.01-1.6.48-2.02 1.22-.86 1.5-.22 3.71.62 4.93.41.6.9 1.27 1.54 1.25.62-.03.85-.4 1.6-.4.74 0 .95.4 1.6.39.66-.01 1.08-.61 1.49-1.21.46-.7.65-1.37.66-1.41-.01-.01-1.27-.49-1.29-1.93ZM9.6 4.3c.34-.42.57-1 .51-1.58-.49.02-1.09.33-1.44.74-.31.37-.59.96-.51 1.52.55.04 1.1-.28 1.44-.68Z" />
    </svg>
  )
}

function EmulatorRow({ emulator }: { emulator: EmulatorInfo }): JSX.Element {
  const bootSimulator = useStore((s) => s.bootSimulator)
  const booted = emulator.state === 'Booted'
  return (
    <div className="sim-row">
      <span className={`sim-row-glyph ${emulator.platform}`} aria-hidden="true">
        <PlatformGlyph platform={emulator.platform} />
      </span>
      <span className="sim-row-copy">
        <span className="sim-row-name">{emulator.name}</span>
        {emulator.detail && <span className="sim-row-detail">{emulator.detail}</span>}
      </span>
      {booted && <span className="sim-row-state">Running</span>}
      <button
        className="sim-row-boot"
        title={`Launch ${emulator.name} in a terminal pane`}
        onClick={() => bootSimulator(emulator)}
      >
        <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true">
          <path d="M5 3.5v9l7-4.5z" />
        </svg>
        {booted ? 'Open' : 'Boot'}
      </button>
    </div>
  )
}

function PlatformSection({
  title,
  platform,
  devices,
  available,
  hint,
  docsUrl
}: {
  title: string
  platform: 'android' | 'ios'
  devices: EmulatorInfo[]
  available: boolean
  hint?: string
  docsUrl: string
}): JSX.Element {
  return (
    <section className="sim-section">
      <div className="sim-section-head">
        <span className={`sim-section-glyph ${platform}`} aria-hidden="true">
          <PlatformGlyph platform={platform} />
        </span>
        <span className="sim-section-title">{title}</span>
        <span className="sim-section-count">{available ? devices.length : '—'}</span>
        <button className="sim-section-docs" onClick={() => window.api.openExternal(docsUrl)}>
          Setup guide
        </button>
      </div>
      {!available ? (
        <div className="sim-note">{hint ?? `${title} are not available on this machine.`}</div>
      ) : devices.length === 0 ? (
        <div className="sim-note">
          No {platform === 'android' ? 'virtual devices' : 'simulators'} found. Create one with the{' '}
          {platform === 'android' ? 'Android Studio Device Manager' : 'Xcode Devices window'}.
        </div>
      ) : (
        <div className="sim-list">
          {devices.map((device) => (
            <EmulatorRow key={device.id} emulator={device} />
          ))}
        </div>
      )}
    </section>
  )
}

export default function SimulatorsPanel(): JSX.Element {
  const toggleSimulators = useStore((s) => s.toggleSimulators)
  const [list, setList] = useState<EmulatorList | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setList(await window.api.emulators.list())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not scan for emulators.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const total = list ? list.android.length + list.ios.length : 0

  return (
    <div className="sim-panel">
      <header className="tasks-head">
        <button className="tasks-icon-btn" title="Close Simulators" onClick={() => toggleSimulators(false)}>
          <svg viewBox="0 0 16 16" width="15" height="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
        <span className="tasks-icon-btn active" title="Mobile Simulators">
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4.5" y="2" width="7" height="12" rx="1.6" />
            <path d="M7 12h2" />
          </svg>
        </span>
        <span className="tasks-context">
          Mobile Simulators · <strong>{loading ? 'scanning…' : `${total} device${total === 1 ? '' : 's'}`}</strong>
        </span>
        <button
          className="tasks-icon-btn ghost sim-refresh"
          title="Rescan for emulators"
          disabled={loading}
          onClick={() => void load()}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={loading ? 'spin' : ''} aria-hidden="true">
            <path d="M13 3v3h-3" />
            <path d="M13 6A5.5 5.5 0 1 0 13.5 9" />
          </svg>
        </button>
      </header>

      <p className="sim-intro">
        Boot an Android emulator or iOS simulator installed on this machine. The device opens in its
        own window and runs in a managed terminal pane you can stop or restart like any other.
      </p>

      <div className="sim-body">
        {error && (
          <div className="tasks-empty">
            <div className="tasks-empty-title">Couldn’t scan for emulators</div>
            <div className="tasks-empty-sub">{error}</div>
          </div>
        )}
        {!error && list && (
          <>
            <PlatformSection
              title="Android emulators"
              platform="android"
              devices={list.android}
              available={list.androidTool.available}
              hint={list.androidTool.hint}
              docsUrl={ANDROID_DOCS}
            />
            <PlatformSection
              title="iOS simulators"
              platform="ios"
              devices={list.ios}
              available={list.iosTool.available}
              hint={list.iosTool.hint}
              docsUrl={IOS_DOCS}
            />
          </>
        )}
      </div>
    </div>
  )
}
