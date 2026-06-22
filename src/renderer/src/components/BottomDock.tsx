import { useStore } from '../store'
import ModelMenu from './ModelMenu'

export default function BottomDock(): JSX.Element {
  const activeId = useStore((s) => s.activeId)
  const removeSession = useStore((s) => s.removeSession)
  const setGrid = useStore((s) => s.setGrid)
  const setMode = useStore((s) => s.setMode)
  const openWorkspace = useStore((s) => s.openWorkspace)
  const browseProject = useStore((s) => s.browseProject)

  return (
    <div className="dock">
      <ModelMenu label="New Session" variant="ghost" />
      <button className="dock-btn" onClick={() => void openWorkspace('file')}>Upload File</button>
      <button className="dock-btn" onClick={() => void browseProject()}>Upload Project</button>
      <button className="dock-btn" onClick={() => setMode('stack')}>Split H</button>
      <button className="dock-btn" onClick={() => setMode('grid')}>Split V</button>
      <button className="dock-btn" onClick={() => activeId && removeSession(activeId)}>Close</button>
      <button className="dock-btn" onClick={() => setGrid(1, 1)}>Maximize</button>
      <button className="dock-btn" onClick={() => setGrid(2, 2)}>Grid 2×2</button>
      <button className="dock-btn">Layouts</button>
    </div>
  )
}
