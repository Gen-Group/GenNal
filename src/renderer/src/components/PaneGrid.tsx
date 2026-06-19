import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useStore, activeProjectPath } from '../store'
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
  const workspace = useStore((s) => s.workspace)
  const rows = useStore((s) => s.rows)
  const cols = useStore((s) => s.cols)
  const mode = useStore((s) => s.mode)
  const activeId = useStore((s) => s.activeId)
  const [colSizes, setColSizes] = useState<number[]>([])
  const [rowSizes, setRowSizes] = useState<number[]>([])
  // Fraction (0.25–1) of the grid a lone terminal occupies on each axis, so a
  // single pane can be shrunk/grown even though there's no neighbour to push
  // against (multi-pane resizing redistributes fr units between tracks instead).
  const [soloW, setSoloW] = useState(1)
  const [soloH, setSoloH] = useState(1)

  // Terminals belong to the project they were opened in. We always render every
  // session so its live shell is never unmounted (which would kill the pty), and
  // simply hide the ones that don't belong to the active project. Switching
  // projects therefore swaps which terminals are shown and brings the previous
  // project's terminals back exactly as they were left.
  const projectPath = activeProjectPath(workspace)
  const mine = sessions.filter((s) => s.projectPath === projectPath)

  // Stack / Tabs collapse to a single visible pane; Grid/Float tile them.
  const tiled = mode === 'grid' || mode === 'float'
  const focusedId = mine.some((s) => s.id === activeId) ? activeId : mine[0]?.id
  const visibleIds = new Set(tiled ? mine.map((s) => s.id) : focusedId ? [focusedId] : [])

  const grid = fitGrid(mine.length, rows, cols)
  const columns = colSizes.length === grid.cols ? colSizes : Array(grid.cols).fill(1)
  const gridRows = rowSizes.length === grid.rows ? rowSizes : Array(grid.rows).fill(1)

  // Exactly one tiled terminal: it gets edge handles instead of the between-pane
  // resizers, which need a neighbouring track to trade space with.
  const solo = tiled && mine.length === 1

  useEffect(() => {
    setColSizes(Array(grid.cols).fill(1))
    setRowSizes(Array(grid.rows).fill(1))
  }, [grid.cols, grid.rows])

  // Reset the lone-pane size whenever we leave the solo case, so reopening a
  // single terminal starts full-size rather than at the last drag.
  useEffect(() => {
    if (!solo) {
      setSoloW(1)
      setSoloH(1)
    }
  }, [solo])

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

  const startSoloResize = (axis: 'col' | 'row', event: ReactPointerEvent): void => {
    event.preventDefault()
    event.stopPropagation()

    const rect = gridRef.current?.getBoundingClientRect()
    if (!rect) return

    const start = axis === 'col' ? event.clientX : event.clientY
    const size = axis === 'col' ? rect.width : rect.height
    const initial = axis === 'col' ? soloW : soloH

    const onMove = (moveEvent: PointerEvent): void => {
      const current = axis === 'col' ? moveEvent.clientX : moveEvent.clientY
      const delta = (current - start) / Math.max(size, 1)
      const next = Math.max(0.25, Math.min(1, initial + delta))
      if (axis === 'col') setSoloW(next)
      else setSoloH(next)
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

  const showResizers = tiled && mine.length > 1

  return (
    <div
      ref={gridRef}
      className={`pane-grid mode-${mode}`}
      style={
        solo
          ? {
              gridTemplateColumns:
                soloW >= 0.999
                  ? 'minmax(0, 1fr)'
                  : `minmax(0, ${soloW}fr) minmax(0, ${1 - soloW}fr)`,
              gridTemplateRows:
                soloH >= 0.999
                  ? 'minmax(0, 1fr)'
                  : `minmax(0, ${soloH}fr) minmax(0, ${1 - soloH}fr)`
            }
          : tiled
            ? {
                gridTemplateColumns: columns.map((value) => `minmax(0, ${value}fr)`).join(' '),
                gridTemplateRows: gridRows.map((value) => `minmax(0, ${value}fr)`).join(' ')
              }
            : undefined
      }
    >
      {sessions.map((s) => {
        const number = mine.findIndex((m) => m.id === s.id) + 1
        return (
          <ModelPane key={s.id} session={s} hidden={!visibleIds.has(s.id)} number={number || undefined} />
        )
      })}

      {mine.length === 0 && (
        <div className="grid-empty-overlay">
          <div className="ge-card">
            <img className="ge-mark" src={logoUrl} alt="GenNal logo" />
            <h2>Launch your first model</h2>
            <p>Run Codex, Claude &amp; Gemini side by side — each in its own live session.</p>
            <ModelMenu label="+ New Session" variant="primary" />
          </div>
        </div>
      )}

      {showResizers &&
        percentPositions(columns).map((left, index) => (
          <button
            key={`col-${index}`}
            className="grid-resizer col-resizer"
            style={{ left: `${left}%` }}
            aria-label={`Resize terminal column ${index + 1}`}
            onPointerDown={(event) => startResize('col', index, event)}
          />
        ))}
      {showResizers &&
        percentPositions(gridRows).map((top, index) => (
          <button
            key={`row-${index}`}
            className="grid-resizer row-resizer"
            style={{ top: `${top}%` }}
            aria-label={`Resize terminal row ${index + 1}`}
            onPointerDown={(event) => startResize('row', index, event)}
          />
        ))}

      {solo && (
        <>
          <button
            className="grid-resizer col-resizer solo-resizer"
            style={{ left: `${soloW * 100}%` }}
            aria-label="Resize terminal width"
            onPointerDown={(event) => startSoloResize('col', event)}
          />
          <button
            className="grid-resizer row-resizer solo-resizer"
            style={{ top: `${soloH * 100}%` }}
            aria-label="Resize terminal height"
            onPointerDown={(event) => startSoloResize('row', event)}
          />
        </>
      )}
    </div>
  )
}
