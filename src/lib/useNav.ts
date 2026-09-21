import { useCallback, useEffect, useRef, useState } from 'react'

export type Screen =
  | { name: 'home' }
  | { name: 'client'; clientId: string }
  | { name: 'startSession' }
  | { name: 'session'; sessionId: string }
  | { name: 'sessionDetail'; sessionId: string }
  | { name: 'settings' }
  | { name: 'crew' }
  | { name: 'profile'; clientId: string }

interface HistoryState {
  depth: number
}

interface NavState {
  stack: Screen[]
  index: number
}

/**
 * A screen stack wired into the History API so Android's back gesture walks
 * back through the app instead of closing it.
 *
 * The stack is kept whole and a cursor moves through it, mirroring how the
 * browser's own history works — going back and then forward returns to the
 * screen you left rather than dropping it.
 *
 * The app can open on a stack rather than a single screen. An invite link
 * lands straight on the crew screen, and without Home underneath it there is
 * nothing to go back to: the back control is inert and the Android gesture
 * leaves the app entirely. Passing [home, crew] puts the rest of the app
 * where someone arriving by link can reach it.
 */
export function useNav(initialStack: Screen[] = [{ name: 'home' }]) {
  const [nav, setNav] = useState<NavState>({
    stack: initialStack,
    index: initialStack.length - 1,
  })
  const navRef = useRef(nav)
  navRef.current = nav

  useEffect(() => {
    // Seed one history entry per screen the app opened on top of the root, or
    // there is no entry for history.back() to return to.
    history.replaceState({ depth: 0 } satisfies HistoryState, '')
    for (let depth = 1; depth <= navRef.current.index; depth++) {
      history.pushState({ depth } satisfies HistoryState, '')
    }

    const onPopState = (event: PopStateEvent) => {
      const depth = (event.state as HistoryState | null)?.depth ?? 0
      setNav((current) => ({
        ...current,
        index: Math.max(0, Math.min(depth, current.stack.length - 1)),
      }))
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const push = useCallback((screen: Screen) => {
    setNav((current) => {
      const index = current.index + 1
      history.pushState({ depth: index } satisfies HistoryState, '')
      // A new push discards anything that was ahead of the cursor, exactly as a
      // browser drops the forward entries.
      return { stack: [...current.stack.slice(0, current.index + 1), screen], index }
    })
  }, [])

  /** Swap the current screen without leaving a stale entry behind it. */
  const replace = useCallback((screen: Screen) => {
    setNav((current) => {
      history.replaceState({ depth: current.index } satisfies HistoryState, '')
      const stack = [...current.stack]
      stack[current.index] = screen
      return { ...current, stack }
    })
  }, [])

  const back = useCallback(() => {
    if (navRef.current.index > 0) history.back()
  }, [])

  return { screen: nav.stack[nav.index], depth: nav.index, push, replace, back }
}
