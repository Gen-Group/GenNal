import { useStore } from '../store'

function Spark({ color }: { color: string }): JSX.Element {
  // Decorative sparkline matching the screenshot's System Overview.
  const pts = '0,14 12,9 24,12 36,5 48,10 60,3 72,8 84,6 96,11'
  return (
    <svg className="spark" viewBox="0 0 96 18" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  )
}

export default function Sidebar(): JSX.Element {
  const sessions = useStore((s) => s.sessions)
  const activeId = useStore((s) => s.activeId)
  const setActive = useStore((s) => s.setActive)
  const stats = useStore((s) => s.stats)
  const togglePalette = useStore((s) => s.togglePalette)
  const workspace = useStore((s) => s.workspace)
  const workspaceError = useStore((s) => s.workspaceError)
  const openWorkspace = useStore((s) => s.openWorkspace)
  const openWorkspaceFile = useStore((s) => s.openWorkspaceFile)
  const running = sessions.filter((s) => s.status === 'running').length

  return (
    <aside className="sidebar">
      <section className="side-sec">
        <div className="side-head">
          <span>WORKSPACES</span>
          <button className="mini" onClick={() => void openWorkspace('project')}>+ Project</button>
        </div>
        <button className="ws-item active" onClick={() => void openWorkspace('project')}>
          <span className="ws-dot" style={{ background: '#f5a623' }} />
          <span className="ws-name">{workspace?.name ?? 'Open a project'}</span>
          <span className="badge">{workspace?.files.length ?? sessions.length}</span>
        </button>
        <button className="qa" onClick={() => void openWorkspace('file')}>Upload File</button>
        <button className="qa" onClick={() => void openWorkspace('project')}>Upload Project</button>
        {workspaceError && <div className="side-error">{workspaceError}</div>}
        {workspace && (
          <div className="file-list">
            {workspace.files.slice(0, 24).map((file) => (
              <button
                key={file.path}
                className={`file-item ${workspace.selectedFile?.path === file.path ? 'active' : ''}`}
                title={file.relativePath}
                onClick={() => void openWorkspaceFile(file)}
              >
                {file.relativePath}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="side-sec">
        <div className="side-head">
          <span>MODEL SESSIONS</span>
        </div>
        {sessions.length === 0 && <div className="side-empty">No models running yet.</div>}
        {sessions.map((s) => (
          <button
            key={s.id}
            className={`sess-item ${activeId === s.id ? 'active' : ''}`}
            onClick={() => setActive(s.id)}
          >
            <span
              className={`sess-dot ${s.status}`}
              style={{ background: s.status === 'running' ? s.accent : undefined }}
            />
            <span className="sess-name">{s.label}</span>
            <span className="sess-state">{s.status}</span>
          </button>
        ))}
      </section>

      <section className="side-sec">
        <div className="side-head"><span>SYSTEM OVERVIEW</span></div>
        <div className="ov-row">
          <div>
            <div className="ov-big">{running} Active</div>
            <div className="ov-sub">Models</div>
          </div>
          <Spark color="#22c55e" />
        </div>
        <div className="ov-row">
          <div>
            <div className="ov-big">{(stats.memUsedMB / 1024).toFixed(1)} GB</div>
            <div className="ov-sub">Memory</div>
          </div>
          <Spark color="#4285f4" />
        </div>
        <div className="ov-row">
          <div>
            <div className="ov-big">{stats.cpu}%</div>
            <div className="ov-sub">CPU</div>
          </div>
          <Spark color="#7c5cff" />
        </div>
      </section>

      <section className="side-sec">
        <div className="side-head"><span>QUICK ACTIONS</span></div>
        <button className="qa" onClick={() => togglePalette(true)}>
          Command Palette <kbd>Ctrl K</kbd>
        </button>
      </section>

      <div className="side-user">
        <div className="avatar">JD</div>
        <div>
          <div className="u-name">John Doe</div>
          <div className="u-state">● Online</div>
        </div>
      </div>
    </aside>
  )
}
