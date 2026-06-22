import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type {
  EmulatorInfo,
  EmulatorList,
  EmulatorToolStatus
} from '../shared/types'

const isWindows = process.platform === 'win32'
const isMac = process.platform === 'darwin'

// Boots open their own OS window; the pane that launches them runs the user's
// shell, so quoting must match that shell. PowerShell needs the call operator
// (&) to run a quoted executable path; POSIX shells run it directly.
function psSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function shSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

// ---- Android ---------------------------------------------------------------

// Locate the Android SDK from the standard env vars, then the per-OS default
// install locations Android Studio uses.
function androidSdkRoot(): string | null {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    isWindows ? join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk') : null,
    isMac ? join(homedir(), 'Library', 'Android', 'sdk') : null,
    !isWindows && !isMac ? join(homedir(), 'Android', 'Sdk') : null
  ].filter((p): p is string => Boolean(p))
  return candidates.find((p) => existsSync(p)) ?? null
}

function emulatorBinary(sdk: string): string {
  return join(sdk, 'emulator', isWindows ? 'emulator.exe' : 'emulator')
}

function androidLaunchCommand(bin: string, avd: string): string {
  return isWindows
    ? `& ${psSingleQuote(bin)} -avd ${psSingleQuote(avd)}`
    : `${shSingleQuote(bin)} -avd ${shSingleQuote(avd)}`
}

function listAndroid(): { devices: EmulatorInfo[]; tool: EmulatorToolStatus } {
  const sdk = androidSdkRoot()
  if (!sdk) {
    return {
      devices: [],
      tool: {
        available: false,
        hint: 'Android SDK not found. Install Android Studio, or set ANDROID_HOME to your SDK path.'
      }
    }
  }

  const bin = emulatorBinary(sdk)
  if (!existsSync(bin)) {
    return {
      devices: [],
      tool: {
        available: false,
        path: sdk,
        hint: 'The Android emulator is not installed. In Android Studio open SDK Manager → SDK Tools and add "Android Emulator".'
      }
    }
  }

  try {
    const result = spawnSync(bin, ['-list-avds'], {
      encoding: 'utf8',
      timeout: 8000,
      windowsHide: true
    })
    const names = (result.stdout ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      // -list-avds may print warnings; real AVD names have no spaces.
      .filter((line) => line.length > 0 && /^[\w.\- ]+$/.test(line) && !/\s/.test(line))

    const devices: EmulatorInfo[] = names.map((name) => ({
      id: name,
      name: name.replace(/_/g, ' '),
      platform: 'android',
      detail: 'Android Virtual Device',
      launchCommand: androidLaunchCommand(bin, name)
    }))

    return { devices, tool: { available: true, path: sdk } }
  } catch {
    return {
      devices: [],
      tool: { available: false, path: sdk, hint: 'Could not run the Android emulator tool.' }
    }
  }
}

// ---- iOS (macOS only) ------------------------------------------------------

interface SimctlDevice {
  udid: string
  name: string
  state: string
  isAvailable?: boolean
}

function iosLaunchCommand(udid: string): string {
  // `simctl boot` is idempotent-ish: it errors when already booted, which we
  // swallow, then open the Simulator UI focused on the device.
  return `xcrun simctl boot ${shSingleQuote(udid)} 2>/dev/null; open -a Simulator`
}

function listIos(): { devices: EmulatorInfo[]; tool: EmulatorToolStatus } {
  if (!isMac) {
    return {
      devices: [],
      tool: {
        available: false,
        hint: 'iOS Simulators are only available on macOS with Xcode installed.'
      }
    }
  }

  let result: ReturnType<typeof spawnSync>
  try {
    result = spawnSync('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], {
      encoding: 'utf8',
      timeout: 8000
    })
  } catch {
    return { devices: [], tool: { available: false, hint: 'Xcode command line tools not found.' } }
  }

  if (result.error || !result.stdout) {
    return {
      devices: [],
      tool: {
        available: false,
        hint: 'Xcode command line tools not found. Install Xcode, then run "xcode-select --install".'
      }
    }
  }

  try {
    const parsed = JSON.parse(String(result.stdout)) as {
      devices: Record<string, SimctlDevice[]>
    }
    const devices: EmulatorInfo[] = []
    for (const [runtime, list] of Object.entries(parsed.devices)) {
      // Runtime keys look like "com.apple.CoreSimulator.SimRuntime.iOS-17-2".
      const label = runtime
        .split('.')
        .pop()!
        .replace(/^iOS-/, 'iOS ')
        .replace(/-/g, '.')
      for (const device of list) {
        if (device.isAvailable === false) continue
        devices.push({
          id: device.udid,
          name: device.name,
          platform: 'ios',
          detail: label,
          state: device.state,
          launchCommand: iosLaunchCommand(device.udid)
        })
      }
    }
    return { devices, tool: { available: true } }
  } catch {
    return { devices: [], tool: { available: false, hint: 'Could not read the iOS simulator list.' } }
  }
}

export function listEmulators(): EmulatorList {
  const android = listAndroid()
  const ios = listIos()
  return {
    android: android.devices,
    ios: ios.devices,
    androidTool: android.tool,
    iosTool: ios.tool
  }
}
