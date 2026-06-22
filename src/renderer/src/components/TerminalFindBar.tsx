import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { SearchAddon, ISearchOptions } from '@xterm/addon-search'

// Highlight colors for matches in the terminal viewport + overview ruler.
const DECORATIONS: ISearchOptions['decorations'] = {
  matchBackground: '#7c5cff55',
  matchOverviewRuler: '#7c5cff',
  activeMatchBackground: '#f5c84c88',
  activeMatchColorOverviewRuler: '#f5c84c'
}

// A find-in-terminal bar (Ctrl/Cmd+F) that drives an xterm SearchAddon. Renders
// as an overlay in the top-right of whichever terminal container hosts it.
export default function TerminalFindBar({
  search,
  onClose
}: {
  search: SearchAddon
  onClose: () => void
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [count, setCount] = useState<{ current: number; total: number } | null>(null)

  const options = (): ISearchOptions => ({
    caseSensitive,
    decorations: DECORATIONS
  })

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  // xterm reports match counts asynchronously after each search.
  useEffect(() => {
    const sub = search.onDidChangeResults(({ resultIndex, resultCount }) => {
      setCount(resultCount > 0 ? { current: resultIndex + 1, total: resultCount } : { current: 0, total: 0 })
    })
    return () => sub.dispose()
  }, [search])

  // Re-run the search as the query or case option changes.
  useEffect(() => {
    if (query) search.findNext(query, { ...options(), incremental: true })
    else {
      search.clearDecorations()
      setCount(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, caseSensitive])

  const findNext = (): void => {
    if (query) search.findNext(query, options())
  }
  const findPrevious = (): void => {
    if (query) search.findPrevious(query, options())
  }

  const onKeyDown = (e: ReactKeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) findPrevious()
      else findNext()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="term-find" onMouseDown={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        className="term-find-input"
        placeholder="Find"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        spellCheck={false}
      />
      <span className="term-find-count">
        {count ? (count.total ? `${count.current}/${count.total}` : 'No results') : ''}
      </span>
      <button
        className={`term-find-btn${caseSensitive ? ' on' : ''}`}
        title="Match case"
        aria-label="Match case"
        aria-pressed={caseSensitive}
        onClick={() => setCaseSensitive((v) => !v)}
      >
        Aa
      </button>
      <button
        className="term-find-btn"
        title="Previous match (Shift+Enter)"
        aria-label="Previous match"
        onClick={findPrevious}
      >
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 10l4-4 4 4" />
        </svg>
      </button>
      <button
        className="term-find-btn"
        title="Next match (Enter)"
        aria-label="Next match"
        onClick={findNext}
      >
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      <button className="term-find-btn" title="Close (Esc)" aria-label="Close find" onClick={onClose}>
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  )
}
