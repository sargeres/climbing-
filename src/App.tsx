import { useEffect, useMemo } from 'react'
import { StoreProvider, useStore } from './lib/store'
import { useNav, type Screen } from './lib/useNav'
import { HomeScreen } from './screens/HomeScreen'
import { StartSessionScreen } from './screens/StartSessionScreen'
import { ActiveSessionScreen } from './screens/ActiveSessionScreen'
import { SessionDetailScreen } from './screens/SessionDetailScreen'
import { ClientScreen } from './screens/ClientScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { CrewScreen } from './screens/CrewScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { TrophyScreen } from './screens/TrophyScreen'
import { joinCodeFromUrl } from './lib/crew'
import { musicEnabled, startMusic, watchVisibility } from './lib/music'

function Router() {
  const { ready } = useStore()
  // An invite link lands on the normal app URL with the code in the hash, so
  // the crew screen opens straight onto the join form. Home goes underneath it
  // rather than being skipped, so someone who arrives by link can back out into
  // the rest of the app instead of being stranded on the crew screen.
  const inviteCode = useMemo(() => joinCodeFromUrl(), [])
  const initialStack = useMemo<Screen[]>(
    () => (inviteCode ? [{ name: 'home' }, { name: 'crew' }] : [{ name: 'home' }]),
    [inviteCode],
  )
  const { screen, push, replace, back } = useNav(initialStack)

  // The tune only resumes if it was already switched on, and only once the
  // first tap has unlocked audio — browsers refuse it before that, and so
  // would anyone standing in a quiet gym.
  useEffect(() => {
    const stopWatching = watchVisibility()
    if (!musicEnabled()) return stopWatching
    const onFirstTap = () => startMusic()
    document.addEventListener('pointerdown', onFirstTap, { once: true, passive: true })
    return () => {
      document.removeEventListener('pointerdown', onFirstTap)
      stopWatching()
    }
  }, [])

  if (!ready) {
    return (
      <div className="app" style={{ placeContent: 'center', alignItems: 'center' }}>
        <span className="muted">Loading…</span>
      </div>
    )
  }

  switch (screen.name) {
    case 'home':
      return <HomeScreen navigate={push} />

    case 'startSession':
      // The started session takes this screen's place in the stack, so backing
      // out of a live session goes home instead of to the setup form.
      return <StartSessionScreen onBack={back} onStarted={replace} />

    case 'session':
      return (
        <ActiveSessionScreen
          key={screen.sessionId}
          sessionId={screen.sessionId}
          onBack={back}
          onEnded={replace}
        />
      )

    case 'sessionDetail':
      return (
        <SessionDetailScreen
          key={screen.sessionId}
          sessionId={screen.sessionId}
          onBack={back}
          onDeleted={back}
          onReopened={() => replace({ name: 'session', sessionId: screen.sessionId })}
        />
      )

    case 'client':
      return (
        <ClientScreen
          key={screen.clientId}
          clientId={screen.clientId}
          onBack={back}
          navigate={push}
          onDeleted={back}
        />
      )

    case 'settings':
      return <SettingsScreen onBack={back} />

    case 'crew':
      return <CrewScreen onBack={back} presetCode={inviteCode} />

    case 'profile':
      return <ProfileScreen key={screen.clientId} clientId={screen.clientId} onBack={back} />

    case 'trophies':
      return <TrophyScreen key={screen.clientId} clientId={screen.clientId} onBack={back} />
  }
}

export default function App() {
  return (
    <StoreProvider>
      <div className="app">
        <Router />
      </div>
    </StoreProvider>
  )
}
