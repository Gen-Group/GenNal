// Shared accent palettes + a path-stable accent helper, so a project's monogram
// color is derived identically everywhere (settings list, project settings, etc.)
// instead of being copied per component.

/** Palette used to derive a project's monogram accent from its path. */
export const PROJECT_ACCENTS = [
  '#7c5cff',
  '#2f8cff',
  '#22c55e',
  '#f97316',
  '#ec4899',
  '#14b8a6',
  '#a78bfa',
  '#f59e0b'
]

/** Swatch choices offered when manually picking an accent (e.g. Add Model). */
export const ACCENT_SWATCHES = [
  '#A78BFA',
  '#D97757',
  '#10A37F',
  '#4285F4',
  '#22c55e',
  '#f97316',
  '#ec4899',
  '#14b8a6'
]

/** Deterministic accent for a path, stable across sessions. */
export function accentForPath(path: string): string {
  let hash = 0
  for (let i = 0; i < path.length; i++) hash = (hash * 31 + path.charCodeAt(i)) | 0
  return PROJECT_ACCENTS[Math.abs(hash) % PROJECT_ACCENTS.length]
}
