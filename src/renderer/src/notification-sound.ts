import type { NotificationSound } from './store'

// A single lazily-created AudioContext shared by every alert. Browsers cap the
// number of contexts, so we never make one per sound.
let ctx: AudioContext | null = null

function audioContext(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    // Autoplay policies suspend the context until a user gesture; resume it.
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** Play one short tone (a sine "beep") at `freq` Hz starting `delay` s from now. */
function beep(context: AudioContext, freq: number, delay: number, duration: number): void {
  const start = context.currentTime + delay
  const osc = context.createOscillator()
  const gain = context.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  // Quick attack, gentle exponential decay so it sounds like a chime, not a click.
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(0.22, start + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(gain)
  gain.connect(context.destination)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

// Each sound is a sequence of [frequency, startDelay, duration] tones.
const PATTERNS: Record<Exclude<NotificationSound, 'none'>, [number, number, number][]> = {
  system: [[660, 0, 0.18]],
  chime: [
    [659.25, 0, 0.16],
    [987.77, 0.14, 0.32]
  ],
  ping: [[1244.51, 0, 0.12]]
}

/**
 * Play the alert tied to a notification-sound preference. `'none'` is silent,
 * and the call is a no-op when Web Audio is unavailable (e.g. headless tests).
 */
export function playNotificationSound(sound: NotificationSound): void {
  if (sound === 'none') return
  const context = audioContext()
  if (!context) return
  for (const [freq, delay, duration] of PATTERNS[sound]) beep(context, freq, delay, duration)
}
