import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useStore } from '../store'
import ModelPane from './ModelPane'
import ModelMenu from './ModelMenu'
import logoUrl from '../assets/gennal-logo.png'

function fitGrid(count: number, preferredRows: number, preferredCols: number): { rows: number; cols: number } {
  if (count <= preferredRows * preferredCols) {
    return { rows: preferredRows, cols: preferredCols }
  }

  const cols = Math.ceil(Math.sqrt(count))
  return { rows: Math.ceil(count / cols), cols }
}

export default function PaneGrid(): JSX.Element {
  const gridRef = useRef<HTMLDivElement>(null)
  const sessions = useStore((s) => s.sessions)
  const rows = useStore((s) => s.rows)
  const cols = useStore((s) => s.cols)
  const mode = useStore((s) => s.mode)
  const activeId = useStore((s) => s.activeId)
  const [colSizes, setColSizes] = useState<number[]>([])
  const [rowSizes, setRowSizes] = useState<number[]>([])
  const grid = fitGrid(sessions.length, rows, cols)
  const columns = colSizes.length === grid.cols ? colSizes : Array(grid.cols).fill(1)
  const gridRows = rowSizes.length === grid.rows ? rowSizes : Array(grid.rows).fill(1)

  useEffect(() => {
    setColSizes(Array(grid.cols).fill(1))
    setRowSizes(Array(grid.rows).fill(1))
  }, [grid.cols, grid.rows])

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

  const startResize = (axis: 'col' | 'row', index: number, event: ReactPointerEvent): void => {
    event.preventDefault()
    event.stopPropagation()

    const rect = gridRef.current?.getBoundingClientRect()
    if (!rect) return

    const start = axis === 'col' ? event.clientX : event.clientY
    const size = axis === 'col' ? rect.width : rect.height
    const initial = axis === 'col' ? [...columns] : [...gridRows]
    const total = initial.reduce((sum, value) => sum + value, 0)
    const pairTotal = initial[index] + initial[index + 1]
    const minTrack = Math.min(0.45, pairTotal / 2)

    const onMove = (moveEvent: PointerEvent): void => {
      const current = axis === 'col' ? moveEvent.clientX : moveEvent.clientY
      const delta = ((current - start) / Math.max(size, 1)) * total
      const next = [...initial]
      const before = Math.max(minTrack, Math.min(pairTotal - minTrack, initial[index] + delta))
      next[index] = before
      next[index + 1] = pairTotal - before

      if (axis === 'col') setColSizes(next)
      else setRowSizes(next)
    }

    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.classList.remove('resizing-grid')
    }

    document.body.classList.add('resizing-grid')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const percentPositions = (sizes: number[]): number[] => {
    const total = sizes.reduce((sum, value) => sum + value, 0)
    let current = 0
    return sizes.slice(0, -1).map((size) => {
      current += size
      return (current / total) * 100
    })
  }

  return (
    <div
      ref={gridRef}
      className={`pane-grid mode-${mode}`}
      style={
        tiled
          ? {
              gridTemplateColumns: columns.map((value) => `minmax(0, ${value}fr)`).join(' '),
              gridTemplateRows: gridRows.map((value) => `minmax(0, ${value}fr)`).join(' ')
            }
          : undefined
      }
    >
      {(tiled ? sessions : visible.slice(0, 1)).map((s) => (
        <ModelPane key={s.id} session={s} />
      ))}
      {tiled &&
        percentPositions(columns).map((left, index) => (
          <button
            key={`col-${index}`}
            className="grid-resizer col-resizer"
            style={{ left: `${left}%` }}
            aria-label={`Resize terminal column ${index + 1}`}
            onPointerDown={(event) => startResize('col', index, event)}
          />
        ))}
      {tiled &&
        percentPositions(gridRows).map((top, index) => (
          <button
            key={`row-${index}`}
            className="grid-resizer row-resizer"
            style={{ top: `${top}%` }}
            aria-label={`Resize terminal row ${index + 1}`}
            onPointerDown={(event) => startResize('row', index, event)}
          />
        ))}
    </div>
  )
}
