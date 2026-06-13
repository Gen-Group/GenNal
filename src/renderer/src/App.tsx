import { useEffect } from 'react'
import { useStore } from './store'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import LayoutToolbar from './components/LayoutToolbar'
import PaneGrid from './components/PaneGrid'
import RightPanel from './components/RightPanel'
import StatusBar from './components/StatusBar'
import CommandPalette from './components/CommandPalette'
import SettingsPanel from './components/SettingsPanel'

export default function App(): JSX.Element {
  const setModels = useStore((s) => s.setModels)
  const setStats = useStore((s) => s.setStats)
  const appendRunOutput = useStore((s) => s.appendRunOutput)
  const finishRun = useStore((s) => s.finishRun)
  const togglePalette = useStore((s) => s.togglePalette)
  const panelSide = useStore((s) => s.panelSide)

  useEffect(() => {
    window.api.listModels().then(setModels)
    const offStats = window.api.onStats(setStats)
    const offRunData = window.api.onRunData(appendRunOutput)
    const offRunExit = window.api.onRunExit(finishRun)
    return () => {
      offStats()
      offRunData()
      offRunExit()
    }
  }, [setModels, setStats, appendRunOutput, finishRun])

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
      <div className={`body panel-${panelSide}`}>
        <Sidebar />
        {panelSide === 'left' && <RightPanel />}
        <main className="center">
          <LayoutToolbar />
          <PaneGrid />
        </main>
        {panelSide === 'right' && <RightPanel />}
      </div>
      <StatusBar />
      <CommandPalette />
      <SettingsPanel />
    </div>
  )
}
