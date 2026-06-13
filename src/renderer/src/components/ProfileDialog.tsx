import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useStore } from '../store'

const MAX_AVATAR_BYTES = 2 * 1024 * 1024 // 2 MB

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function ProfileDialog(): JSX.Element | null {
  const open = useStore((s) => s.profileSetupOpen)
  const profile = useStore((s) => s.profile)
  const setProfile = useStore((s) => s.setProfile)
  const toggleProfileSetup = useStore((s) => s.toggleProfileSetup)

  const [name, setName] = useState(profile.name)
  const [role, setRole] = useState(profile.role)
  const [avatar, setAvatar] = useState(profile.avatar)
  const [avatarError, setAvatarError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Sync local fields whenever the dialog (re)opens.
  useEffect(() => {
    if (open) {
      setName(profile.name)
      setRole(profile.role)
      setAvatar(profile.avatar)
      setAvatarError('')
    }
  }, [open, profile.name, profile.role, profile.avatar])

  if (!open) return null

  const firstRun = profile.name === ''
  const trimmed = name.trim()

  const pickAvatar = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    event.target.value = '' // allow re-selecting the same file later
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setAvatarError('Please choose an image file.')
      return
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError('Image must be 2 MB or smaller.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setAvatar(typeof reader.result === 'string' ? reader.result : '')
      setAvatarError('')
    }
    reader.onerror = () => setAvatarError('Could not read that image.')
    reader.readAsDataURL(file)
  }

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (!trimmed) return
    setProfile({ name: trimmed, role: role.trim(), avatar })
  }

  const dismiss = (): void => {
    // Only let the user dismiss without saving if a profile already exists.
    if (!firstRun) toggleProfileSetup(false)
  }

  return (
    <div className="profile-overlay" onMouseDown={dismiss}>
      <form className="profile-dialog" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="profile-dialog-head">
          <div className="profile-avatar-edit">
            <button
              type="button"
              className={`profile-preview-avatar ${avatar ? 'has-image' : ''}`}
              title={avatar ? 'Change profile picture' : 'Upload profile picture'}
              onClick={() => fileRef.current?.click()}
            >
              {avatar ? (
                <img src={avatar} alt="Profile preview" />
              ) : (
                <span>{initials(trimmed || '?')}</span>
              )}
              <span className="profile-avatar-cam" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </span>
            </button>
            {avatar && (
              <button type="button" className="profile-avatar-remove" onClick={() => setAvatar('')}>
                Remove
              </button>
            )}
          </div>
          <div>
            <h2>{firstRun ? 'Welcome to GenNal' : 'Edit profile'}</h2>
            <p>{firstRun ? 'Add your name to get started.' : 'Update how you appear in GenNal.'}</p>
            {avatarError && <p className="profile-avatar-error">{avatarError}</p>}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="profile-file-input"
            onChange={pickAvatar}
          />
        </div>

        <label className="profile-field">
          <span>Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ada Lovelace"
            maxLength={40}
          />
        </label>

        <label className="profile-field">
          <span>Role <em>(optional)</em></span>
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g. Developer"
            maxLength={40}
          />
        </label>

        <div className="profile-actions">
          {!firstRun && (
            <button type="button" className="profile-cancel" onClick={() => toggleProfileSetup(false)}>
              Cancel
            </button>
          )}
          <button type="submit" className="profile-save" disabled={!trimmed}>
            {firstRun ? 'Continue' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
