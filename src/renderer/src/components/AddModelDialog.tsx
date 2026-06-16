import { useEffect, useState, type FormEvent } from 'react'
import { useStore } from '../store'

const ACCENT_SWATCHES = ['#A78BFA', '#D97757', '#10A37F', '#4285F4', '#22c55e', '#f97316', '#ec4899', '#14b8a6']

export default function AddModelDialog(): JSX.Element | null {
  const open = useStore((s) => s.addModelOpen)
  const toggleAddModel = useStore((s) => s.toggleAddModel)
  const addModel = useStore((s) => s.addModel)

  const [label, setLabel] = useState('')
  const [command, setCommand] = useState('')
  const [tag, setTag] = useState('')
  const [accent, setAccent] = useState(ACCENT_SWATCHES[0])

  useEffect(() => {
    if (open) {
      setLabel('')
      setCommand('')
      setTag('')
      setAccent(ACCENT_SWATCHES[0])
    }
  }, [open])

  if (!open) return null

  const trimmedLabel = label.trim()
  const trimmedCommand = command.trim()
  const valid = trimmedLabel.length > 0 && trimmedCommand.length > 0

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (!valid) return
    void addModel({ label: trimmedLabel, command: trimmedCommand, tag: tag.trim(), accent })
  }

  return (
    <div className="profile-overlay" onMouseDown={() => toggleAddModel(false)}>
      <form className="profile-dialog" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="profile-dialog-head">
          <span className="addmodel-swatch" style={{ background: accent }} aria-hidden="true" />
          <div>
            <h2>Add a model</h2>
            <p>Launch any CLI as a model session. The command runs in a new terminal.</p>
          </div>
        </div>

        <label className="profile-field">
          <span>Name</span>
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Ollama"
            maxLength={40}
          />
        </label>

        <label className="profile-field">
          <span>Command</span>
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="e.g. ollama run llama3"
            maxLength={200}
          />
          <small className="profile-hint">
            Your prompt is added at the end of the command. If the CLI needs it elsewhere
            (e.g. after a subcommand), put <code>{'{prompt}'}</code> where it should go —
            e.g. <code>kiro-cli chat {'{prompt}'}</code>.
          </small>
        </label>

        <label className="profile-field">
          <span>Tag <em>(optional)</em></span>
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="e.g. ollama-cli"
            maxLength={40}
          />
        </label>

        <label className="profile-field">
          <span>Accent</span>
          <div className="addmodel-accents">
            {ACCENT_SWATCHES.map((color) => (
              <button
                type="button"
                key={color}
                className={`addmodel-accent ${accent === color ? 'active' : ''}`}
                style={{ background: color }}
                aria-label={`Use accent ${color}`}
                aria-pressed={accent === color}
                onClick={() => setAccent(color)}
              />
            ))}
            <input
              type="color"
              className="addmodel-accent-custom"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              aria-label="Custom accent color"
            />
          </div>
        </label>

        <div className="profile-actions">
          <button type="button" className="profile-cancel" onClick={() => toggleAddModel(false)}>
            Cancel
          </button>
          <button type="submit" className="profile-save" disabled={!valid}>
            Add model
          </button>
        </div>
      </form>
    </div>
  )
}
