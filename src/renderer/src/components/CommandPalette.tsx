import { useState } from 'react'
import { useStore } from '../store'

export default function CommandPalette(): JSX.Element | null {
  const open = useStore((s) => s.paletteOpen)
  const toggle = useStore((s) => s.togglePalette)
  const models = useStore((s) => s.models)
  const addSession = useStore((s) => s.addSession)
  const setGrid = useStore((s) => s.setGrid)
  const openWorkspace = useStore((s) => s.openWorkspace)
  const [q, setQ] = useState('')

  if (!open) return null

  const commands = [
    ...models.map((m) => ({
      key: `launch-${m.id}`,
      label: `Launch ${m.label}`,
      hint: m.tag,
      run: () => addSession(m.id)
    })),
    { key: 'open-file', label: 'Upload File', hint: 'workspace', run: () => void openWorkspace('file') },
    { key: 'open-project', label: 'Upload Project', hint: 'workspace', run: () => void openWorkspace('project') },
    { key: 'grid-2', label: 'Layout: Grid 2×2', hint: 'layout', run: () => setGrid(2, 2) },
    { key: 'grid-1', label: 'Layout: Single', hint: 'layout', run: () => setGrid(1, 1) }
  ].filter((c) => c.label.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="palette-overlay" onMouseDown={() => toggle(false)}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className="palette-input"
          placeholder="Type a command…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="palette-list">
          {commands.map((c) => (
            <button
              key={c.key}
              className="palette-item"
              onClick={() => {
                c.run()
                toggle(false)
              }}
            >
              <span>{c.label}</span>
              <span className="palette-hint">{c.hint}</span>
            </button>
          ))}
          {commands.length === 0 && <div className="palette-empty">No matching commands</div>}
        </div>
      </div>
    </div>
  )
}
