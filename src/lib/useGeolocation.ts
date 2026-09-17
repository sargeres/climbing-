import { useCallback, useEffect, useState } from 'react'
import type { Coords } from './types'

export type GeoStatus = 'unsupported' | 'locating' | 'ready' | 'denied' | 'failed'

interface GeoState {
  status: GeoStatus
  coords: Coords | null
}

/**
 * One-shot position fix for tagging a session with where it happened.
 *
 * High accuracy is deliberately off: indoors the satellite fix a gym sits in
 * rarely arrives, and the wifi-derived position comes back in a second or two
 * and is easily precise enough to tell one venue from another.
 */
export function useGeolocation(enabled: boolean) {
  const [state, setState] = useState<GeoState>({
    status: 'geolocation' in navigator ? 'locating' : 'unsupported',
    coords: null,
  })

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState({ status: 'unsupported', coords: null })
      return
    }
    setState((s) => ({ ...s, status: 'locating' }))
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setState({
          status: 'ready',
          coords: {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            accuracyM: position.coords.accuracy,
          },
        }),
      (error) =>
        setState({
          status: error.code === error.PERMISSION_DENIED ? 'denied' : 'failed',
          coords: null,
        }),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 120_000 },
    )
  }, [])

  useEffect(() => {
    if (enabled) locate()
  }, [enabled, locate])

  return { ...state, retry: locate }
}
