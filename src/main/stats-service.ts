import si from 'systeminformation'
import type { BrowserWindow } from 'electron'

let timer: NodeJS.Timeout | null = null

export function startStats(win: BrowserWindow): void {
  stopStats()
  timer = setInterval(async () => {
    if (win.isDestroyed()) return stopStats()
    try {
      const [load, mem] = await Promise.all([si.currentLoad(), si.mem()])
      win.webContents.send('stats:update', {
        cpu: Math.round(load.currentLoad),
        memUsedMB: Math.round(mem.active / 1048576),
        memTotalMB: Math.round(mem.total / 1048576)
      })
    } catch {
      /* transient sampling error — try again next tick */
    }
  }, 1500)
}

export function stopStats(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
