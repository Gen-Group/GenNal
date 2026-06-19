// Detects complete http(s) URLs in a stream of terminal output so the app can
// auto-open whatever a model CLI prints (e.g. a Google search it ran) in the
// in-app preview — without the user having to click the link.
//
// Terminal data arrives in arbitrary chunks, so a URL can be split across two
// writes and is usually wrapped in ANSI color / OSC hyperlink escapes. The
// scanner therefore strips escapes, buffers the unterminated tail until a
// whitespace boundary proves the URL is fully received, and reports each
// distinct URL only once so the preview isn't hijacked repeatedly.

const ANSI_CSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g
const ANSI_OSC = /\x1b\][\s\S]*?(?:\x07|\x1b\\)/g
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f]/g
const URL_RE = /https?:\/\/[^\s'"`<>()[\]{}|\\^]+/g
const MAX_BUFFER = 8192

function stripEscapes(text: string): string {
  return text.replace(ANSI_CSI, '').replace(ANSI_OSC, '').replace(CONTROL, ' ')
}

export interface UrlScanner {
  push(chunk: string): void
}

export function createUrlScanner(onUrl: (url: string) => void): UrlScanner {
  // Text received but not yet known to be complete (no trailing whitespace yet).
  let pending = ''
  // Last URL reported, so the same link isn't re-opened on every redraw.
  let lastUrl = ''

  return {
    push(chunk: string): void {
      pending = stripEscapes(pending + chunk)
      // Guard against an unterminated line growing without bound.
      if (pending.length > MAX_BUFFER) pending = pending.slice(-MAX_BUFFER / 2)

      // Only text up to the final whitespace is guaranteed fully received; hold
      // the rest until the next chunk so a still-streaming URL isn't truncated.
      const boundary = Math.max(
        pending.lastIndexOf(' '),
        pending.lastIndexOf('\n'),
        pending.lastIndexOf('\r'),
        pending.lastIndexOf('\t')
      )
      if (boundary < 0) return

      const ready = pending.slice(0, boundary)
      pending = pending.slice(boundary + 1)

      const matches = ready.match(URL_RE)
      if (!matches) return

      // Open the most recent URL in the batch; trim trailing punctuation that
      // commonly follows a link in prose ("see https://x/y.").
      const url = matches[matches.length - 1].replace(/[.,;:!?)\]}]+$/, '')
      if (url && url !== lastUrl) {
        lastUrl = url
        onUrl(url)
      }
    }
  }
}
