import { useMemo, useState } from 'react'
import { useStore } from '../store'

const CODE_TABS = ['CODE', 'OUTPUT', 'TERMINAL', 'PROBLEMS']

const SAMPLE = `import 'package:flutter/material.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'GenNal',
      home: const HomePage(),
    );
  }
}`

export default function RightPanel(): JSX.Element {
  const [codeTab, setCodeTab] = useState('CODE')
  const workspace = useStore((s) => s.workspace)
  const workspaceError = useStore((s) => s.workspaceError)
  const openWorkspace = useStore((s) => s.openWorkspace)
  const updateWorkspaceContent = useStore((s) => s.updateWorkspaceContent)
  const saveWorkspaceFile = useStore((s) => s.saveWorkspaceFile)
  const [sampleCode, setSampleCode] = useState(SAMPLE)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const selectedFile = workspace?.selectedFile
  const code = workspace?.content ?? sampleCode
  const fileLabel = selectedFile?.relativePath ?? 'main.dart'
  const lineNumbers = useMemo(
    () => Array.from({ length: Math.max(code.split('\n').length, 1) }, (_, i) => i + 1),
    [code]
  )

  const handleCodeChange = (value: string): void => {
    setSaveState('idle')
    if (workspace) {
      updateWorkspaceContent(value)
    } else {
      setSampleCode(value)
    }
  }

  const handleSave = async (): Promise<void> => {
    if (!selectedFile) return
    setSaveState('saving')
    await saveWorkspaceFile(code)
    setSaveState('saved')
  }

  return (
    <aside className="rightpanel">
      <div className="rp-code">
        <div className="rp-tabs">
          {CODE_TABS.map((t) => (
            <button key={t} className={codeTab === t ? 'active' : ''} onClick={() => setCodeTab(t)}>
              {t}
            </button>
          ))}
          <button className="run-btn">Run</button>
        </div>
        <div className="rp-file">
          <span>{fileLabel}</span>
          {workspace?.truncated && <span className="rp-warn">Preview truncated</span>}
          {workspaceError && <span className="rp-warn">{workspaceError}</span>}
          <button disabled={!selectedFile || saveState === 'saving'} onClick={() => void handleSave()}>
            {saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved' : 'Save'}
          </button>
          <button onClick={() => void openWorkspace('file')}>Upload File</button>
        </div>
        <div className="code-editor">
          <div className="code-gutter" aria-hidden="true">
            {lineNumbers.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
          <textarea
            className="code-input"
            spellCheck={false}
            value={code}
            onChange={(e) => handleCodeChange(e.target.value)}
          />
        </div>
      </div>

    </aside>
  )
}
