// The in-app website preview is meant for local dev servers a model spins up
// (e.g. `npm run dev` printing http://localhost:5173). A clicked URL only opens
// the preview when it points at this machine; anything else goes to the system
// browser. Printed URLs are never auto-opened — the user must click them.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1'])

/** True for http(s) URLs that point at the local machine (dev servers, etc.). */
export function isLocalhostUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    const host = hostname.replace(/^\[|\]$/g, '') // strip IPv6 brackets
    return LOCAL_HOSTS.has(host) || host.endsWith('.localhost')
  } catch {
    return false
  }
}
