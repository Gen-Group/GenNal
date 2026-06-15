import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { useStore } from './store'
import './styles.css'
import '@xterm/xterm/css/xterm.css'

// Honor the "Clear local data on exit" privacy option when the window closes.
window.addEventListener('beforeunload', () => {
  const { privacySettings, clearLocalData } = useStore.getState()
  if (privacySettings.clearOnExit) clearLocalData()
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
