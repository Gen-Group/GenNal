import { useStore } from '../store'
import ModelMenu from './ModelMenu'
import logoUrl from '../assets/gennal-logo.png'

export default function TitleBar(): JSX.Element {
  const togglePalette = useStore((s) => s.togglePalette)
  const toggleSettings = useStore((s) => s.toggleSettings)

  return (
    <header className="titlebar">
      <div className="tb-left drag">
        <img className="brand-mark" src={logoUrl} alt="GenNal logo" />
        <span className="brand-name">GenNal</span>
        <span className="brand-pill">Pro</span>
      </div>

      <div className="tb-center no-drag">
        <button className="quick-cmd" onClick={() => togglePalette(true)}>
          <span>Quick command</span>
          <kbd>Ctrl K</kbd>
        </button>
      </div>

      <div className="tb-right no-drag">
        <ModelMenu label="+ New Session" variant="primary" />
        <button className="icon-btn settings-btn" title="Settings" onClick={() => toggleSettings(true)}>
          Set
        </button>
        <div className="win-ctrls">
          <button className="win-btn" onClick={() => window.api.win.minimize()}>-</button>
          <button className="win-btn" onClick={() => window.api.win.maximize()}>[]</button>
          <button className="win-btn close" onClick={() => window.api.win.close()}>x</button>
        </div>
      </div>
    </header>
  )
}
