import { useEffect } from 'react'
import { useStore } from '../store'

function formatSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ImagePreview(): JSX.Element | null {
  const preview = useStore((s) => s.imagePreview)
  const closeImagePreview = useStore((s) => s.closeImagePreview)

  useEffect(() => {
    if (!preview) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeImagePreview()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [preview, closeImagePreview])

  if (!preview) return null

  const size = formatSize(preview.size)

  return (
    <div className="imgpv-overlay" onMouseDown={closeImagePreview}>
      <div className="imgpv-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="imgpv-head">
          <div className="imgpv-meta">
            <span className="imgpv-name" title={preview.relativePath}>{preview.name}</span>
            {size && <span className="imgpv-size">{size}</span>}
          </div>
          <button className="imgpv-close" title="Close preview" aria-label="Close preview" onClick={closeImagePreview}>
            <svg viewBox="0 0 16 16" width="15" height="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        <div className="imgpv-stage">
          <img src={preview.src} alt={preview.name} />
        </div>
      </div>
    </div>
  )
}
