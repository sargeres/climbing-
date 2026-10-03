import { useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { musicEnabled, setMusicEnabled } from '../lib/music'
import { TopBar } from '../components/ui'
import { migrate } from '../lib/db'
import type { AppData } from '../lib/types'

function download(filename: string, contents: string, mime: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

const stamp = () => new Date().toISOString().slice(0, 10)

const csvCell = (value: string | number) => {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** One row per attempt, joined back to its session and client. */
function toCsv(data: AppData): string {
  const clients = new Map(data.clients.map((c) => [c.id, c]))
  const sessions = new Map(data.sessions.map((s) => [s.id, s]))
  const header = [
    'date',
    'client',
    'venue',
    'problem',
    'grade',
    'completion_pct',
    'effort',
    'climb_seconds',
    'rest_seconds',
    'logged_at',
    'latitude',
    'longitude',
    'video_url',
  ]
  const rows = [...data.climbs]
    .sort((a, b) => a.loggedAt - b.loggedAt)
    .map((climb) => {
      const session = sessions.get(climb.sessionId)
      const client = session ? clients.get(session.clientId) : undefined
      return [
        session ? new Date(session.startedAt).toISOString().slice(0, 10) : '',
        client?.name ?? '',
        session?.venue ?? '',
        climb.problemName,
        climb.grade,
        climb.completion,
        climb.effort,
        Math.round(climb.climbSec),
        Math.round(climb.restSec),
        new Date(climb.loggedAt).toISOString(),
        session?.coords ? session.coords.lat.toFixed(6) : '',
        session?.coords ? session.coords.lon.toFixed(6) : '',
        climb.videoUrl,
      ].map(csvCell)
    })
  return [header.join(','), ...rows.map((r) => r.join(','))].join('\n')
}

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const [music, setMusic] = useState(() => musicEnabled())
  const { data, replaceAll } = useStore()
  const fileInput = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)

  const importFile = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text())
      const next = migrate(parsed)
      if (next.clients.length === 0 && next.sessions.length === 0 && next.climbs.length === 0) {
        setStatus('That file had no Sendlog data in it.')
        return
      }
      replaceAll(next)
      setStatus(
        `Restored ${next.clients.length} clients, ${next.sessions.length} sessions, ${next.climbs.length} attempts.`,
      )
    } catch {
      setStatus("Couldn't read that file — it needs to be a Sendlog JSON backup.")
    }
  }

  return (
    <>
      <TopBar title="Settings" onBack={onBack} />
      <main className="content">
        <div className="card stack">
          <div>
            <div className="section-label">Music</div>
            <p className="tiny muted" style={{ margin: '6px 0 0' }}>
              A looping town theme, off by default — an app you open mid-session
              shouldn't start singing at you in a public gym. It goes quiet by
              itself while the rest alarm rings or a shout is spoken, and stops
              when you switch away.
            </p>
          </div>
          <button
            className={`btn btn-block${music ? ' btn-primary' : ''}`}
            aria-pressed={music}
            onClick={() => {
              const next = !music
              setMusic(next)
              setMusicEnabled(next)
            }}
          >
            {music ? 'Music on' : 'Music off'}
          </button>
        </div>

        <div className="card stack">
          <div>
            <div className="section-label">Backup</div>
            <p className="tiny muted" style={{ margin: '6px 0 0' }}>
              Everything is stored on this phone only. Export regularly so a lost or wiped
              device doesn't take the log with it.
            </p>
          </div>
          <button
            className="btn btn-block"
            onClick={() =>
              download(`sendlog-${stamp()}.json`, JSON.stringify(data, null, 2), 'application/json')
            }
          >
            Export backup (JSON)
          </button>
          <button
            className="btn btn-block"
            onClick={() => download(`sendlog-${stamp()}.csv`, toCsv(data), 'text/csv')}
          >
            Export attempts (CSV)
          </button>
          <button className="btn btn-block" onClick={() => fileInput.current?.click()}>
            Restore from backup
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importFile(file)
              e.target.value = ''
            }}
          />
          {status && (
            <p className="tiny" style={{ color: 'var(--brand)', margin: 0 }}>
              {status}
            </p>
          )}
          <p className="tiny faint" style={{ margin: 0 }}>
            Restoring replaces everything currently in the app.
          </p>
        </div>

        <div className="card">
          <div className="section-label" style={{ marginBottom: 10 }}>
            Install on your phone
          </div>
          <p className="tiny muted" style={{ margin: 0 }}>
            In Chrome, open the ⋮ menu and choose <strong>Add to Home screen</strong>. Sendlog then
            opens full screen and works with no signal at the gym.
          </p>
        </div>

        <div className="card">
          <div className="section-label" style={{ marginBottom: 10 }}>
            Stored on this device
          </div>
          <div className="tiny muted">
            {data.clients.length} clients · {data.sessions.length} sessions · {data.climbs.length}{' '}
            attempts
          </div>
        </div>
      </main>
    </>
  )
}
