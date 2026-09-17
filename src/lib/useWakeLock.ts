import { useEffect } from 'react'

/**
 * Hold the screen awake while a session is running — the phone sits on the mat
 * between attempts and a locked screen loses the rest timer at a glance.
 * Unsupported browsers and denied requests both degrade to normal behaviour.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return

    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      try {
        sentinel = await navigator.wakeLock.request('screen')
      } catch {
        /* denied or unavailable — nothing to do */
      }
    }

    // The lock is dropped whenever the tab is hidden; take it back on return.
    const onVisible = () => {
      if (!cancelled && document.visibilityState === 'visible') void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release().catch(() => undefined)
    }
  }, [active])
}
