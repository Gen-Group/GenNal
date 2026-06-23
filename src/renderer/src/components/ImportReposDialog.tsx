import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import Modal from './Modal'

/** Branch/repo glyph shown beside each discovered repository. */
function RepoGlyph(): JSX.Element {
  return (
    <span className="import-repo-glyph" aria-hidden="true">
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="5" cy="4" r="1.6" />
        <circle cx="5" cy="12" r="1.6" />
        <circle cx="11" cy="7" r="1.6" />
        <path d="M5 5.6v4.8M5 9c0-2 1-3 4.4-3" />
      </svg>
    </span>
  )
}

export default function ImportReposDialog(): JSX.Element | null {
  const scan = useStore((s) => s.importRepos)
  const importReposSeparately = useStore((s) => s.importReposSeparately)
  const importAsMonorepo = useStore((s) => s.importAsMonorepo)
  const dismiss = useStore((s) => s.dismissImportRepos)

  const repoPaths = useMemo(() => (scan ? scan.repos.map((r) => r.path) : []), [scan])
  const [selected, setSelected] = useState<Set<string>>(() => new Set(repoPaths))
  const [monorepoName, setMonorepoName] = useState(scan?.name ?? '')

  // Reset local state whenever a new folder scan opens the dialog.
  useEffect(() => {
    setSelected(new Set(repoPaths))
    setMonorepoName(scan?.name ?? '')
  }, [scan, repoPaths])

  if (!scan) return null

  const total = scan.repos.length
  const allSelected = selected.size === total
  const selectedPaths = scan.repos.filter((r) => selected.has(r.path)).map((r) => r.path)

  const toggleRepo = (path: string): void => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const toggleAll = (): void => {
    setSelected(allSelected ? new Set() : new Set(repoPaths))
  }

  return (
    <Modal onClose={dismiss}>
      <div
        className="import-repos-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-repos-title"
      >
        <div className="import-repos-head">
          <button className="import-repos-close" title="Close" aria-label="Close" onClick={dismiss}>
            <svg viewBox="0 0 14 14" width="14" height="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M3.5 3.5 L10.5 10.5 M10.5 3.5 L3.5 10.5" />
            </svg>
          </button>
        </div>

        <h2 id="import-repos-title" className="import-repos-title">
          Import repositories from folder
        </h2>
        <p className="import-repos-sub" title={scan.path}>
          Found {total} {total === 1 ? 'repository' : 'repositories'} in {scan.path}
        </p>

        <div className="import-repos-list">
          <button className="import-repos-row import-repos-all" onClick={toggleAll}>
            <span className={`import-check ${allSelected ? 'on' : selected.size > 0 ? 'partial' : ''}`} aria-hidden="true">
              {allSelected ? (
                <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
                </svg>
              ) : selected.size > 0 ? (
                <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 8h8" />
                </svg>
              ) : null}
            </span>
            <span className="import-repos-all-label">{allSelected ? 'Deselect all' : 'Select all'}</span>
            <span className="import-repos-count">
              {selected.size} of {total} selected
            </span>
          </button>

          {scan.repos.map((repo) => {
            const on = selected.has(repo.path)
            return (
              <button
                key={repo.path}
                className={`import-repos-row ${on ? 'on' : ''}`}
                onClick={() => toggleRepo(repo.path)}
                title={repo.path}
              >
                <span className={`import-check ${on ? 'on' : ''}`} aria-hidden="true">
                  {on && (
                    <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
                    </svg>
                  )}
                </span>
                <RepoGlyph />
                <span className="import-repos-name">{repo.name}</span>
                {!repo.isRepo && <span className="import-repos-tag">project</span>}
              </button>
            )
          })}
        </div>

        <div className="import-repos-mono">
          <div className="import-repos-mono-title">Is this a monorepo?</div>
          <p className="import-repos-mono-desc">
            Choose this if these projects belong together. GenNal will group them and let you work
            from the parent folder.
          </p>
          <label className="import-repos-field">
            <span>Monorepo name</span>
            <input
              type="text"
              value={monorepoName}
              onChange={(event) => setMonorepoName(event.target.value)}
              placeholder={scan.name}
              spellCheck={false}
            />
          </label>
        </div>

        <div className="import-repos-actions">
          <button
            className="import-repos-secondary"
            disabled={selectedPaths.length === 0}
            onClick={() => void importReposSeparately(selectedPaths)}
          >
            No, import separately
          </button>
          <button
            className="import-repos-primary"
            disabled={selectedPaths.length === 0}
            onClick={() => void importAsMonorepo(monorepoName.trim() || scan.name)}
          >
            Yes, import as monorepo
          </button>
        </div>
      </div>
    </Modal>
  )
}
