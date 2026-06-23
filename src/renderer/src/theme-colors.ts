// Resolve CSS design tokens to concrete color strings.
//
// xterm.js needs real color values (e.g. "rgb(14, 16, 24)"), not `var(--token)`
// or `color-mix(...)`, and the terminal must track the active theme. We resolve
// a token by assigning it to the `color` of a hidden probe element and reading
// back the computed value, which the browser has fully substituted/themed.

let probe: HTMLSpanElement | null = null

function resolveColor(cssValue: string): string {
  if (typeof document === 'undefined') return '#000'
  if (!probe) {
    probe = document.createElement('span')
    probe.style.position = 'absolute'
    probe.style.visibility = 'hidden'
    probe.style.pointerEvents = 'none'
    document.body.appendChild(probe)
  }
  probe.style.color = ''
  probe.style.color = cssValue
  return getComputedStyle(probe).color || '#000'
}

// Resolve a single CSS token/expression (e.g. "var(--accent)") to a concrete
// color string, for APIs that can't consume CSS variables directly (xterm).
export function resolveToken(value: string): string {
  return resolveColor(value)
}

export interface XtermTheme {
  background: string
  foreground: string
  cursor: string
  selectionBackground: string
}

// Build an xterm theme from the current app theme. Pass a per-pane accent to
// override the cursor color (each model pane tints its own cursor).
export function getTerminalTheme(accent?: string): XtermTheme {
  return {
    background: resolveColor('var(--term-bg)'),
    foreground: resolveColor('var(--term-fg)'),
    cursor: accent || resolveColor('var(--term-cursor)'),
    selectionBackground: resolveColor('var(--term-selection)')
  }
}
