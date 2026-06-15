import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import type { ModelDef } from '../shared/types'

const DEFAULT_MODELS: ModelDef[] = [
  { id: 'claude', label: 'Claude', tag: 'claude-code', command: 'claude', accent: '#D97757' },
  { id: 'codex', label: 'Codex', tag: 'codex-cli', command: 'codex', accent: '#10A37F' },
  { id: 'gemini', label: 'Gemini', tag: 'gemini-cli', command: 'gemini', accent: '#4285F4' },
  { id: 'custom', label: 'Shell', tag: 'powershell', command: '', accent: '#A78BFA' }
]

/**
 * Loads the model registry. A user can override the built-in models by placing a
 * `models.json` file in the app's userData directory; otherwise the defaults ship.
 */
export function loadModels(): ModelDef[] {
  try {
    const override = join(app.getPath('userData'), 'models.json')
    if (existsSync(override)) {
      const parsed = JSON.parse(readFileSync(override, 'utf-8')) as ModelDef[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {
    /* fall back to defaults on any parse/read error */
  }
  return DEFAULT_MODELS
}

/**
 * Persists the full model list to the userData `models.json` override and
 * returns it. The renderer sends the complete list (defaults + user additions)
 * so a single file is the source of truth on the next launch.
 */
export function saveModels(models: ModelDef[]): ModelDef[] {
  const override = join(app.getPath('userData'), 'models.json')
  writeFileSync(override, JSON.stringify(models, null, 2), 'utf-8')
  return models
}
