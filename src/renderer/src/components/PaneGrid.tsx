import { useStore } from '../store'
import ModelPane from './ModelPane'
import ModelMenu from './ModelMenu'
import logoUrl from '../assets/gennal-logo.png'

export default function PaneGrid(): JSX.Element {
  const sessions = useStore((s) => s.sessions)
  const rows = useStore((s) => s.rows)
  const cols = useStore((s) => s.cols)
  const mode = useStore((s) => s.mode)
  const activeId = useStore((s) => s.activeId)

  if (sessions.length === 0) {
    return (
      <div className="grid-empty">
        <div className="ge-card">
          <img className="ge-mark" src={logoUrl} alt="GenNal logo" />
          <h2>Launch your first model</h2>
          <p>Run Codex, Claude &amp; Gemini side by side — each in its own live session.</p>
          <ModelMenu label="+ New Model Session" variant="primary" />
        </div>
      </div>
    )
  }

  // Stack / Tabs collapse to a single visible pane; Grid/Float tile them.
  const tiled = mode === 'grid' || mode === 'float'
  const visible = tiled ? sessions : sessions.filter((s) => s.id === activeId || sessions[0].id === s.id)

  return (
    <div
      className={`pane-grid mode-${mode}`}
      style={
        tiled
          ? {
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gridTemplateRows: `repeat(${rows}, 1fr)`
            }
          : undefined
      }
    >
      {(tiled ? sessions : visible.slice(0, 1)).map((s) => (
        <ModelPane key={s.id} session={s} />
      ))}
    </div>
  )
}
