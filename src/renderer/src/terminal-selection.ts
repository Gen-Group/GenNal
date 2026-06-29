import type { Terminal } from '@xterm/xterm'
import type { MouseEvent as ReactMouseEvent } from 'react'

interface TerminalPoint {
  col: number
  row: number
}

interface DragState {
  start: TerminalPoint
  moved: boolean
  startX: number
  startY: number
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function pointFromMouse(term: Terminal, event: MouseEvent): TerminalPoint | null {
  const screen = term.element?.querySelector<HTMLElement>('.xterm-screen')
  if (!screen || term.cols <= 0 || term.rows <= 0) return null

  const rect = screen.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null

  const cellWidth = rect.width / term.cols
  const cellHeight = rect.height / term.rows
  const viewportCol = clamp(Math.floor((event.clientX - rect.left) / cellWidth), 0, term.cols - 1)
  const viewportRow = clamp(Math.floor((event.clientY - rect.top) / cellHeight), 0, term.rows - 1)

  return {
    col: viewportCol,
    row: term.buffer.active.viewportY + viewportRow
  }
}

function selectBetween(term: Terminal, start: TerminalPoint, end: TerminalPoint): void {
  const startOffset = start.row * term.cols + start.col
  const endOffset = end.row * term.cols + end.col
  const first = startOffset <= endOffset ? start : end
  const last = startOffset <= endOffset ? end : start
  const length = Math.max(1, (last.row - first.row) * term.cols + last.col - first.col + 1)
  term.select(first.col, first.row, length)
}

export function startPlainTerminalSelection(term: Terminal | null, event: ReactMouseEvent): void {
  if (!term || event.button !== 0) return
  if (!(event.target as HTMLElement | null)?.closest('.xterm')) return

  const start = pointFromMouse(term, event.nativeEvent)
  if (!start) return

  event.preventDefault()
  event.stopPropagation()
  term.focus()

  const drag: DragState = {
    start,
    moved: false,
    startX: event.clientX,
    startY: event.clientY
  }

  const onMove = (moveEvent: MouseEvent): void => {
    const point = pointFromMouse(term, moveEvent)
    if (!point) return

    const distance = Math.hypot(moveEvent.clientX - drag.startX, moveEvent.clientY - drag.startY)
    if (distance < 3 && !drag.moved) return

    drag.moved = true
    moveEvent.preventDefault()
    selectBetween(term, drag.start, point)
  }

  const onUp = (upEvent: MouseEvent): void => {
    document.removeEventListener('mousemove', onMove, true)
    document.removeEventListener('mouseup', onUp, true)
    upEvent.preventDefault()
    if (!drag.moved) term.clearSelection()
  }

  document.addEventListener('mousemove', onMove, true)
  document.addEventListener('mouseup', onUp, true)
}
