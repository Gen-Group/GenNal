import { useEffect, type CSSProperties } from 'react'
import { useStore } from './store'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import LayoutToolbar from './components/LayoutToolbar'
import PaneGrid from './components/PaneGrid'
import BrowserPreview from './components/BrowserPreview'
import TasksPanel from './components/TasksPanel'
import AutomationsPanel from './components/AutomationsPanel'
import SessionHistoryPanel from './components/SessionHistoryPanel'
import SimulatorsPanel from './components/SimulatorsPanel'
import ComputerUsePanel from './components/ComputerUsePanel'
import RightPanel from './components/RightPanel'
import StatusBar from './components/StatusBar'
import CommandPalette from './components/CommandPalette'
import SettingsPanel from './components/SettingsPanel'
import ProfileDialog from './components/ProfileDialog'
import AddModelDialog from './components/AddModelDialog'
import MobileDialog from './components/MobileDialog'
import ImagePreview from './components/ImagePreview'
import ImportReposDialog from './components/ImportReposDialog'
import PromptModal from './components/PromptModal'

export default function App(): JSX.Element {
  const setModels = useStore((s) => s.setModels)
  const setStats = useStore((s) => s.setStats)
  const appendRunOutput = useStore((s) => s.appendRunOutput)
  const finishRun = useStore((s) => s.finishRun)
  const restoreWorkspace = useStore((s) => s.restoreWorkspace)
  const restoreWorkspaceOnLaunch = useStore((s) => s.generalSettings.restoreWorkspaceOnLaunch)
  const togglePalette = useStore((s) => s.togglePalette)
  const panelSide = useStore((s) => s.panelSide)
  const panelWidth = useStore((s) => s.panelWidth)
  const panelOpen = useStore((s) => s.panelOpen)
  const panelMaximized = useStore((s) => s.panelMaximized)
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const tasksOpen = useStore((s) => s.tasksOpen)
  const automationsOpen = useStore((s) => s.automationsOpen)
  const historyOpen = useStore((s) => s.historyOpen)
  const simulatorsOpen = useStore((s) => s.simulatorsOpen)
  const computerUseOpen = useStore((s) => s.computerUseOpen)
  const previewCenter = useStore((s) => s.previewCenter)
  const tickAutomations = useStore((s) => s.tickAutomations)
  const workspace = useStore((s) => s.workspace)
  const sessions = useStore((s) => s.sessions)
  // The terminal grid is only the visible center content when no feature panel
  // and no centered browser preview is up; otherwise it stays mounted but hidden.
  const workspaceVisible =
    !tasksOpen && !automationsOpen && !historyOpen && !simulatorsOpen && !computerUseOpen && !previewCenter
  const bodyClasses = [
    'body',
    `panel-${panelSide}`,
    sidebarOpen ? '' : 'sidebar-closed',
    panelOpen ? '' : 'panel-closed',
    panelOpen && panelMaximized ? 'panel-max' : ''
  ]
    .filter(Boolean)
    .join(' ')

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
    if (restoreWorkspaceOnLaunch) void restoreWorkspace()
  }, [restoreWorkspace, restoreWorkspaceOnLaunch])

  // Keep the mobile bridge's view of the open project + terminals fresh. The
  // server can run in the background (after the QR dialog closes), so push this
  // whenever the workspace or sessions change — it's a no-op when sharing is off.
  useEffect(() => {
    window.api.mobile.setContext({
      cwd: workspace?.kind === 'project' ? workspace.path : undefined,
      panes: sessions.map((s) => ({ id: s.id, label: s.label, tag: s.tag }))
    })
  }, [workspace, sessions])

  // Background scheduler: fire any due automations while the app is open.
  useEffect(() => {
    tickAutomations()
    const timer = window.setInterval(() => tickAutomations(), 30_000)
    return () => window.clearInterval(timer)
  }, [tickAutomations])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        togglePalette()
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        window.api.win.newWindow()
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        const s = useStore.getState()
        s.openPreview(s.previewUrl || s.browserSettings.homeUrl.trim() || 'https://www.google.com')
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        window.api.zoom.in()
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === '-' || e.key === '_')) {
        e.preventDefault()
        window.api.zoom.out()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault()
        window.api.zoom.reset()
      }
      if (e.key === 'Escape') togglePalette(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePalette])

  return (
    <div className="app">
      <TitleBar />
      <div
        className={bodyClasses}
        style={{ '--right-panel-width': `${panelWidth}px` } as CSSProperties}
      >
        {sidebarOpen && <Sidebar />}
        {panelSide === 'left' && panelOpen && <RightPanel />}
        <main className="center">
          {/* Feature panels and the centered browser preview overlay the
              workspace, but the workspace (terminal grid) stays mounted at all
              times so its live ptys are never killed. Unmounting PaneGrid would
              run every ModelPane's cleanup (ptyKill + term.dispose), which is
              why switching to a feature and back used to reset all terminals. */}
          {tasksOpen ? (
            <TasksPanel />
          ) : automationsOpen ? (
            <AutomationsPanel />
          ) : historyOpen ? (
            <SessionHistoryPanel />
          ) : simulatorsOpen ? (
            <SimulatorsPanel />
          ) : computerUseOpen ? (
            <ComputerUsePanel />
          ) : (
            <>
              <LayoutToolbar />
              {previewCenter && <BrowserPreview active center />}
            </>
          )}
          <div
            className="workspace-host"
            style={{ display: workspaceVisible ? undefined : 'none' }}
          >
            <PaneGrid />
          </div>
        </main>
        {panelSide === 'right' && panelOpen && <RightPanel />}
      </div>
      <StatusBar />
      <CommandPalette />
      <SettingsPanel />
      <ProfileDialog />
      <AddModelDialog />
      <MobileDialog />
      <ImagePreview />
      <ImportReposDialog />
      <PromptModal />
    </div>
  )
}
