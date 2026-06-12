import { useStore, type LayoutMode } from '../store'
import ModelMenu from './ModelMenu'

const MODES: { id: LayoutMode; label: string; icon: string }[] = [
  { id: 'grid', label: 'Grid', icon: '▦' },
  { id: 'tabs', label: 'Tabs', icon: '▭' },
  { id: 'stack', label: 'Stack', icon: '☰' },
  { id: 'float', label: 'Float', icon: '◳' }
]

export default function LayoutToolbar(): JSX.Element {
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)
  const rows = useStore((s) => s.rows)
  const cols = useStore((s) => s.cols)
  const setGrid = useStore((s) => s.setGrid)

  return (
    <div className="toolbar">
      <div className="seg">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`seg-btn ${mode === m.id ? 'active' : ''}`}
            onClick={() => setMode(m.id)}
          >
            <span className="seg-ico">{m.icon}</span>
            {m.label}
          </button>
        ))}
      </div>

      <div className="tb-spacer" />

      <label className="dim">
        Rows
        <select value={rows} onChange={(e) => setGrid(Number(e.target.value), cols)}>
          {[1, 2, 3].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>
      <label className="dim">
        Cols
        <select value={cols} onChange={(e) => setGrid(rows, Number(e.target.value))}>
          {[1, 2, 3].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>

      <ModelMenu label="+ New Model" variant="primary" />
    </div>
  )
}
