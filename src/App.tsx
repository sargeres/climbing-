import { StoreProvider, useStore } from './lib/store'
import { useNav } from './lib/useNav'
import { HomeScreen } from './screens/HomeScreen'
import { StartSessionScreen } from './screens/StartSessionScreen'
import { ActiveSessionScreen } from './screens/ActiveSessionScreen'
import { SessionDetailScreen } from './screens/SessionDetailScreen'
import { ClientScreen } from './screens/ClientScreen'
import { SettingsScreen } from './screens/SettingsScreen'

function Router() {
  const { ready } = useStore()
  const { screen, push, replace, back } = useNav()

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
