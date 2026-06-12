import { useEffect } from 'react'
import { useStore } from './store'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import LayoutToolbar from './components/LayoutToolbar'
import PaneGrid from './components/PaneGrid'
import RightPanel from './components/RightPanel'
import StatusBar from './components/StatusBar'
import BottomDock from './components/BottomDock'
import CommandPalette from './components/CommandPalette'

export default function App(): JSX.Element {
  const setModels = useStore((s) => s.setModels)
  const setStats = useStore((s) => s.setStats)
  const togglePalette = useStore((s) => s.togglePalette)

  useEffect(() => {
    window.api.listModels().then(setModels)
    const offStats = window.api.onStats(setStats)
    return () => offStats()
  }, [setModels, setStats])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        togglePalette()
      }
      if (e.key === 'Escape') togglePalette(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePalette])

  return (
    <div className="app">
      <TitleBar />
      <div className="body">
        <Sidebar />
        <main className="center">
          <LayoutToolbar />
          <PaneGrid />
        </main>
        <RightPanel />
      </div>
      <BottomDock />
      <StatusBar />
      <CommandPalette />
    </div>
  )
}
