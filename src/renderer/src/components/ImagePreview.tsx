import { useStore } from '../store'
import Modal from './Modal'

function formatSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ImagePreview(): JSX.Element | null {
  const preview = useStore((s) => s.imagePreview)
  const closeImagePreview = useStore((s) => s.closeImagePreview)

  if (!preview) return null

  const size = formatSize(preview.size)

  return (
    <Modal onClose={closeImagePreview} overlayClassName="modal-roomy">
      <div className="imgpv-dialog" role="dialog" aria-modal="true" aria-label={preview.name}>
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
    </Modal>
  )
}
