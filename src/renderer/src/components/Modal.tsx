import { useEffect, useRef, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface ModalProps {
  // Called when the user dismisses (Escape or backdrop click). Only fires when
  // `dismissable` is true.
  onClose: () => void
  // When false the dialog can't be dismissed by Escape/backdrop (e.g. a forced
  // first-run profile step). Defaults to true.
  dismissable?: boolean
  // Extra class on the overlay for per-dialog spacing variants.
  overlayClassName?: string
  children: ReactNode
}

// Shared modal chrome + behavior for every dialog: one tokenized backdrop and
// entrance animation, Escape-to-close, a Tab focus-trap, and focus restoration
// to whatever was focused before the dialog opened. The panel itself stays the
// consumer's element (with its own classes + dialog ARIA), so each dialog keeps
// its exact look while sharing one consistent, accessible shell.
export default function Modal({
  onClose,
  dismissable = true,
  overlayClassName,
  children
}: ModalProps): JSX.Element {
  const overlayRef = useRef<HTMLDivElement>(null)

  // Keep the latest callback/flag in refs so the focus-trap effect can stay
  // mount-only. Without this, a consumer passing an inline `onClose` would
  // re-run the effect on every render — re-focusing the first control and
  // yanking a scrolled panel back to the top.
  const onCloseRef = useRef(onClose)
  const dismissableRef = useRef(dismissable)
  onCloseRef.current = onClose
  dismissableRef.current = dismissable

  useEffect(() => {
    const overlay = overlayRef.current
    const prevFocus = document.activeElement as HTMLElement | null

    const focusables = (): HTMLElement[] =>
      overlay
        ? Array.from(overlay.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
            (el) => el.offsetParent !== null || el === document.activeElement
          )
        : []

    // Respect a child's autoFocus; otherwise focus the first focusable control.
    if (overlay && !overlay.contains(document.activeElement)) {
      focusables()[0]?.focus()
    }

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && dismissableRef.current) {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key === 'Tab') {
        const items = focusables()
        if (items.length === 0) {
          e.preventDefault()
          return
        }
        const idx = items.indexOf(document.activeElement as HTMLElement)
        if (e.shiftKey && idx <= 0) {
          e.preventDefault()
          items[items.length - 1].focus()
        } else if (!e.shiftKey && (idx === -1 || idx === items.length - 1)) {
          e.preventDefault()
          items[0].focus()
        }
      }
    }

    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      // Restore focus to the trigger so keyboard users aren't dropped at <body>.
      prevFocus?.focus?.()
    }
    // Mount-only: refs above keep onClose/dismissable current without re-running.
  }, [])

  const onOverlayMouseDown = (e: ReactMouseEvent): void => {
    if (e.target === overlayRef.current && dismissable) onClose()
  }

  return (
    <div
      ref={overlayRef}
      className={`modal-overlay${overlayClassName ? ` ${overlayClassName}` : ''}`}
      onMouseDown={onOverlayMouseDown}
    >
      {children}
    </div>
  )
}
