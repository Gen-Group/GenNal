import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useStore } from '../store'
import Modal from './Modal'

// Themed, in-app replacement for window.prompt(), driven by store.prompt().
// Mounted once at the app root; renders whenever a prompt request is pending.
export default function PromptModal(): JSX.Element | null {
  const req = useStore((s) => s.promptRequest)
  const resolvePrompt = useStore((s) => s.resolvePrompt)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!req) return
    setValue(req.initialValue ?? '')
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [req])

  if (!req) return null

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    resolvePrompt(value.trim())
  }

  return (
    <Modal onClose={() => resolvePrompt(null)}>
      <form
        className="profile-dialog prompt-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-title"
        onSubmit={submit}
      >
        <div className="profile-dialog-head">
          <div>
            <h2 id="prompt-title">{req.title}</h2>
            {req.label && <p>{req.label}</p>}
          </div>
        </div>

        <label className="profile-field">
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={req.placeholder}
            spellCheck={false}
          />
        </label>

        <div className="profile-actions">
          <button type="button" className="btn-secondary" onClick={() => resolvePrompt(null)}>
            Cancel
          </button>
          <button type="submit" className="btn-primary">
            {req.confirmLabel ?? 'OK'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
