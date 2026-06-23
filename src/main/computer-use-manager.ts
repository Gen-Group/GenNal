import { spawnSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type {
  ComputerUseAction,
  ComputerUseResult,
  ComputerUseScreen,
  ComputerUseScreenshot,
  ComputerUseSetup
} from '../shared/types'

const isWindows = process.platform === 'win32'

function rootDir(): string {
  return join(app.getPath('userData'), 'computer-use')
}

function shotsDir(): string {
  return join(rootDir(), 'shots')
}

function scriptPath(): string {
  return join(rootDir(), 'gennal-computer.ps1')
}

function wrapperPath(): string {
  return join(rootDir(), 'gennal-computer.cmd')
}

// The control engine. The GenNal panel runs it for the live preview / manual
// control, and the CLI agent runs the same script (through the .cmd wrapper) to
// drive the desktop itself — one shared implementation, no native modules.
//
// NOTE: this is authored as a plain string (not a template literal) so the
// PowerShell `$` variables and `${}` syntax are never touched by JS.
const PS_SCRIPT = [
  'param([Parameter(Position=0)][string]$cmd, [Parameter(ValueFromRemainingArguments=$true)]$rest)',
  "$ErrorActionPreference = 'Stop'",
  'Add-Type -AssemblyName System.Windows.Forms',
  'Add-Type -AssemblyName System.Drawing',
  "if (-not ([System.Management.Automation.PSTypeName]'GennalCU').Type) {",
  'Add-Type @"',
  'using System;',
  'using System.Runtime.InteropServices;',
  'public class GennalCU {',
  '  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);',
  '  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, IntPtr extra);',
  '  public const uint MOVE=0x0001, LEFTDOWN=0x0002, LEFTUP=0x0004, RIGHTDOWN=0x0008, RIGHTUP=0x0010, MIDDLEDOWN=0x0020, MIDDLEUP=0x0040, WHEEL=0x0800;',
  '}',
  '"@',
  '}',
  'function Get-VScreen { return [System.Windows.Forms.SystemInformation]::VirtualScreen }',
  'function Do-Click([int]$x,[int]$y,[string]$button) {',
  '  if ($x -ge 0 -and $y -ge 0) { [GennalCU]::SetCursorPos($x,$y) | Out-Null; Start-Sleep -Milliseconds 40 }',
  '  switch ($button) {',
  "    'right'  { [GennalCU]::mouse_event([GennalCU]::RIGHTDOWN,0,0,0,[IntPtr]::Zero); [GennalCU]::mouse_event([GennalCU]::RIGHTUP,0,0,0,[IntPtr]::Zero) }",
  "    'middle' { [GennalCU]::mouse_event([GennalCU]::MIDDLEDOWN,0,0,0,[IntPtr]::Zero); [GennalCU]::mouse_event([GennalCU]::MIDDLEUP,0,0,0,[IntPtr]::Zero) }",
  '    default  { [GennalCU]::mouse_event([GennalCU]::LEFTDOWN,0,0,0,[IntPtr]::Zero); [GennalCU]::mouse_event([GennalCU]::LEFTUP,0,0,0,[IntPtr]::Zero) }',
  '  }',
  '}',
  'switch ($cmd) {',
  "  'size'   { $b = Get-VScreen; Write-Output (\"{0} {1}\" -f $b.Width, $b.Height) }",
  "  'cursor' { $p = [System.Windows.Forms.Cursor]::Position; Write-Output (\"{0} {1}\" -f $p.X, $p.Y) }",
  "  'screenshot' {",
  '    $out = if ($rest -and $rest[0]) { [string]$rest[0] } else { Join-Path $env:TEMP "gennal-shot.png" }',
  '    $b = Get-VScreen',
  '    $bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)',
  '    $g = [System.Drawing.Graphics]::FromImage($bmp)',
  '    $g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)',
  '    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)',
  '    $g.Dispose(); $bmp.Dispose()',
  '    Write-Output $out',
  '    Write-Output ("{0} {1}" -f $b.Width, $b.Height)',
  '  }',
  "  'move' { [GennalCU]::SetCursorPos([int]$rest[0], [int]$rest[1]) | Out-Null }",
  "  'click' {",
  "    if ($rest.Count -ge 2 -and ([string]$rest[0]) -match '^-?\\d+$') { Do-Click ([int]$rest[0]) ([int]$rest[1]) ([string]$rest[2]) }",
  '    else { Do-Click -1 -1 ([string]$rest[0]) }',
  '  }',
  "  'doubleclick' {",
  "    if ($rest.Count -ge 2 -and ([string]$rest[0]) -match '^-?\\d+$') { Do-Click ([int]$rest[0]) ([int]$rest[1]) 'left' } else { Do-Click -1 -1 'left' }",
  "    Start-Sleep -Milliseconds 60; Do-Click -1 -1 'left'",
  '  }',
  "  'type' { [System.Windows.Forms.SendKeys]::SendWait(($rest -join ' ')) }",
  "  'key'  { [System.Windows.Forms.SendKeys]::SendWait([string]$rest[0]) }",
  "  'scroll' { $amt = [int]$rest[0]; [GennalCU]::mouse_event([GennalCU]::WHEEL,0,0,[uint32]($amt*120),[IntPtr]::Zero) }",
  "  default { Write-Error ('unknown command: ' + $cmd) }",
  '}'
].join('\r\n')

const CMD_WRAPPER = [
  '@echo off',
  'powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0gennal-computer.ps1" %*'
].join('\r\n')

/** Write (or refresh) the control tool on disk; returns the wrapper path. */
function ensureTool(): string {
  mkdirSync(shotsDir(), { recursive: true })
  // Always rewrite so an updated GenNal ships an updated tool.
  writeFileSync(scriptPath(), PS_SCRIPT, 'utf8')
  writeFileSync(wrapperPath(), CMD_WRAPPER, 'utf8')
  return wrapperPath()
}

function runTool(args: string[], timeout = 20000): { code: number; stdout: string; stderr: string } {
  ensureTool()
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath(), ...args],
    { encoding: 'utf8', windowsHide: true, timeout }
  )
  return {
    code: typeof result.status === 'number' ? result.status : 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim()
  }
}

export function computerUseSetup(): ComputerUseSetup {
  if (isWindows) ensureTool()
  return {
    toolPath: wrapperPath(),
    dir: rootDir(),
    supported: isWindows,
    platform: process.platform
  }
}

export function computerUseScreen(): ComputerUseScreen {
  if (!isWindows) return { width: 0, height: 0 }
  const { stdout } = runTool(['size'])
  const [w, h] = stdout.split(/\s+/).map((n) => parseInt(n, 10))
  return { width: w || 0, height: h || 0 }
}

export function computerUseScreenshot(): ComputerUseScreenshot {
  if (!isWindows) {
    throw new Error('Desktop control is only available on Windows in this build.')
  }
  const out = join(shotsDir(), `shot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`)
  const { code, stdout, stderr } = runTool(['screenshot', out])
  if (code !== 0 || !existsSync(out)) {
    throw new Error(stderr || 'Screen capture failed.')
  }
  const lines = stdout.split(/\r?\n/).filter(Boolean)
  const [w, h] = (lines[1] ?? '').split(/\s+/).map((n) => parseInt(n, 10))
  const png = readFileSync(out)
  return {
    path: out,
    dataUrl: `data:image/png;base64,${png.toString('base64')}`,
    width: w || 0,
    height: h || 0
  }
}

export function computerUsePerform(action: ComputerUseAction): ComputerUseResult {
  if (!isWindows) {
    return { ok: false, message: 'Desktop control is only available on Windows in this build.' }
  }
  let args: string[]
  switch (action.kind) {
    case 'move':
      args = ['move', String(Math.round(action.x)), String(Math.round(action.y))]
      break
    case 'click':
      args =
        action.x != null && action.y != null
          ? ['click', String(Math.round(action.x)), String(Math.round(action.y)), action.button ?? 'left']
          : ['click', action.button ?? 'left']
      break
    case 'doubleclick':
      args =
        action.x != null && action.y != null
          ? ['doubleclick', String(Math.round(action.x)), String(Math.round(action.y))]
          : ['doubleclick']
      break
    case 'type':
      args = ['type', action.text]
      break
    case 'key':
      args = ['key', action.keys]
      break
    case 'scroll':
      args = ['scroll', String(Math.round(action.amount))]
      break
    default:
      return { ok: false, message: 'Unknown action.' }
  }
  const { code, stderr } = runTool(args)
  return code === 0 ? { ok: true } : { ok: false, message: stderr || 'Action failed.' }
}
