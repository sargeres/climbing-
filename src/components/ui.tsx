import { useEffect, useRef, useState, type ReactNode } from 'react'
import { avatarColor, completionColor, gradeColor, initials } from '../lib/colors'
import { GRADES, type Climb, type Grade, type Session } from '../lib/types'
import { formatDate, formatDurationShort } from '../lib/format'
import { gradeBreakdown, summarise } from '../lib/stats'

export function TopBar({
  title,
  subtitle,
  onBack,
  action,
}: {
  title: string
  subtitle?: string
  onBack?: () => void
  action?: ReactNode
}) {
  return (
    <header className="topbar">
      {onBack && (
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M15 19l-7-7 7-7"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
      <div className="topbar-title">
        <h1>{title}</h1>
        {subtitle && <div className="topbar-sub">{subtitle}</div>}
      </div>
      {action}
    </header>
  )
}

export function GradePill({ grade }: { grade: Grade }) {
  return (
    <span className="grade-pill" style={{ background: gradeColor(grade) }}>
      {grade}
    </span>
  )
}

export function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar" style={{ background: avatarColor(name), color: '#0b0d12' }}>
      {initials(name)}
    </span>
  )
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

export function GradePicker({
  value,
  onChange,
}: {
  value: Grade | null
  onChange: (grade: Grade) => void
}) {
  return (
    <div className="grade-grid">
      {GRADES.map((grade) => {
        const selected = value === grade
        const color = gradeColor(grade)
        return (
          <button
            key={grade}
            type="button"
            className="grade-option"
            aria-pressed={selected}
            onClick={() => onChange(grade)}
            style={
              selected
                ? { background: color, borderColor: color, color: '#0b0d12' }
                : { borderColor: `${color}55`, color }
            }
          >
            {grade}
          </button>
        )
      })}
    </div>
  )
}

export function GradeHistogram({ climbs }: { climbs: Climb[] }) {
  const rows = gradeBreakdown(climbs)
  const max = Math.max(1, ...rows.map((r) => r.attempts))
  return (
    <div>
      <div className="hist">
        {rows.map((row) => (
          <div className="hist-col" key={row.grade}>
            <span className="hist-tick" style={{ color: row.attempts ? 'var(--text-dim)' : undefined }}>
              {row.attempts || ''}
            </span>
            <div
              className="hist-bar"
              style={{
                height: `${(row.attempts / max) * 100}%`,
                background: row.attempts ? `${gradeColor(row.grade)}38` : 'var(--surface-2)',
              }}
              title={`${row.grade}: ${row.attempts} attempts, ${row.sends} sent`}
            >
              {row.sends > 0 && (
                <div
                  className="hist-bar-sends"
                  style={{
                    height: `${(row.sends / row.attempts) * 100}%`,
                    background: gradeColor(row.grade),
                  }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="hist" style={{ height: 'auto', marginTop: 6 }}>
        {rows.map((row) => (
          <div className="hist-col" key={row.grade} style={{ height: 'auto' }}>
            <span className="hist-tick">{row.grade}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** One logged attempt, with the rest that preceded it shown above the row. */
export interface ShareState {
  shared: boolean
  busy: boolean
  onToggle: () => void
}

/**
 * One logged attempt.
 *
 * The share control lives here rather than only inside the edit sheet. It was
 * originally tucked below the grade picker, slider, effort grid and video field
 * of a sheet you had to know to open — which meant the person who asked for the
 * feature could not find it. Sharing a climb belongs on the climb.
 *
 * A row is therefore a container with two buttons rather than one big button:
 * nesting a button inside a button is invalid, and the share target needs its
 * own hit area anyway.
 */
export function ClimbRow({
  climb,
  onClick,
  share,
}: {
  climb: Climb
  onClick?: () => void
  share?: ShareState
}) {
  const pctColor = completionColor(climb.completion)
  return (
    <div className="list-item climb-row">
      <button className="climb-main" onClick={onClick}>
        <GradePill grade={climb.grade} />
        <div className="list-main">
          <div className="list-title">
            {climb.problemName.trim() || <span className="faint">Unnamed problem</span>}
          </div>
          <div className="row" style={{ gap: 8, marginTop: 6 }}>
            <div className="bar" style={{ flex: 1 }}>
              <div
                className="bar-fill"
                style={{ width: `${climb.completion}%`, background: pctColor }}
              />
            </div>
            <span
              className="tiny"
              style={{ color: pctColor, fontWeight: 650, minWidth: 38, textAlign: 'right' }}
            >
              {climb.completion}%
            </span>
          </div>
          <div className="tiny faint" style={{ marginTop: 5 }}>
            {climb.videoUrl && (
              <>
                <span style={{ color: 'var(--brand)', fontWeight: 650 }}>▶ Video</span>
                {' · '}
              </>
            )}
            Effort {climb.effort}/10
            {climb.climbSec > 0 && (
              <>
                {' · '}
                <span style={{ color: 'var(--climb)' }}>
                  {formatDurationShort(Math.round(climb.climbSec))} on the wall
                </span>
              </>
            )}
            {' · '}
            {formatDurationShort(Math.round(climb.restSec))} rest before
          </div>
        </div>
      </button>

      {share && (
        <button
          className={`climb-share${share.shared ? ' shared' : ''}`}
          onClick={share.onToggle}
          disabled={share.busy}
          aria-pressed={share.shared}
          aria-label={share.shared ? 'On the crew board — tap to remove' : 'Share with crew'}
          title={share.shared ? 'On the crew board — tap to remove' : 'Share with crew'}
        >
          {share.busy ? '…' : share.shared ? '✓' : '↗'}
          <span className="climb-share-label">{share.shared ? 'Shared' : 'Share'}</span>
        </button>
      )}
    </div>
  )
}

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  // A sheet is a screen in its own right: swallow the Android back gesture to
  // dismiss it instead of leaving the session underneath.
  //
  // The handler reads onClose through a ref so this effect runs once per sheet.
  // Tying it to the onClose identity would re-push a history entry on every
  // render of the screen behind it — and the session screen re-renders each
  // second to move its clock.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    history.pushState({ ...(history.state as object), sheet: true }, '')
    const onPop = () => closeRef.current()
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // Only unwind the entry if it is still ours: a back gesture already
      // consumed it.
      if ((history.state as { sheet?: boolean } | null)?.sheet) history.back()
    }
  }, [])

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grabber" />
        <div className="spread" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 19 }}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </>
  )
}

/**
 * One session in a list, with its own delete control.
 *
 * The control lives on the row for the same reason the share control does:
 * deleting a session used to mean opening it first and scrolling past every
 * stat to a button at the bottom, which is indistinguishable from not having
 * one. A mis-logged session is noticed in the list, so it is removable from
 * the list.
 *
 * Two buttons in a container rather than one button, because a button cannot
 * be nested inside a button and the delete target needs its own hit area.
 */
export function SessionRow({
  session,
  climbs,
  onClick,
  onDelete,
}: {
  session: Session
  climbs: Climb[]
  onClick: () => void
  onDelete?: () => void
}) {
  const summary = summarise(climbs)
  const live = session.endedAt === null
  const when = formatDate(session.startedAt)
  return (
    <div className="list-item climb-row">
      <button className="climb-main session-main" onClick={onClick}>
        <div className="list-main">
          <div className="list-title">{session.venue}</div>
          <div className="tiny muted">
            {when} ·{' '}
            {formatDurationShort(((session.endedAt ?? Date.now()) - session.startedAt) / 1000)} ·{' '}
            {summary.climbCount} attempt{summary.climbCount === 1 ? '' : 's'}, {summary.sendCount}{' '}
            sent
          </div>
        </div>
        {summary.hardestSend ? (
          <span className="grade-pill" style={{ background: gradeColor(summary.hardestSend) }}>
            {summary.hardestSend}
          </span>
        ) : live ? (
          <span className="pulse" />
        ) : (
          <span className="faint tiny">—</span>
        )}
      </button>

      {onDelete && (
        <button
          className="row-delete"
          onClick={onDelete}
          aria-label={`Delete session at ${session.venue} on ${when}`}
          title="Delete session"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="climb-share-label">Delete</span>
        </button>
      )}
    </div>
  )
}

/** How long the destructive button stays inert on each step. */
const ARM_MS = 600

/**
 * A confirmation that asks twice before destroying something.
 *
 * One sheet is enough to catch a tap that was meant for the row above. It is
 * not enough for a session holding an afternoon of someone else's logged
 * attempts, so this asks again: the first step names what would be lost, the
 * second makes you agree to it after you have read the number.
 *
 * Each step puts the safe choice under the thumb and holds the destructive
 * button inert for a moment, so the second half of an accidental double-tap
 * lands on the safe option or on nothing. Because the steps share one Sheet,
 * the Android back gesture dismisses the whole thing rather than leaving a
 * half-answered question on screen.
 */
export function ConfirmDelete({
  title,
  lead,
  finalTitle,
  finalLead,
  confirmLabel,
  keepLabel = 'Keep it',
  onConfirm,
  onCancel,
}: {
  title: string
  lead: ReactNode
  finalTitle: string
  finalLead: ReactNode
  confirmLabel: string
  keepLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const [second, setSecond] = useState(false)
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    setArmed(false)
    const id = window.setTimeout(() => setArmed(true), ARM_MS)
    return () => window.clearTimeout(id)
  }, [second])

  const danger = second ? confirmLabel : 'Delete'
  return (
    <Sheet title={second ? finalTitle : title} onClose={onCancel}>
      <p className="muted tiny" style={{ marginTop: 0 }}>
        {second ? finalLead : lead}
      </p>
      <div className="stack">
        <button className="btn btn-primary btn-lg btn-block" autoFocus onClick={onCancel}>
          {keepLabel}
        </button>
        <button
          className="btn btn-danger btn-block"
          disabled={!armed}
          onClick={() => (second ? onConfirm() : setSecond(true))}
        >
          {armed ? danger : `${danger}…`}
        </button>
      </div>
      {second && (
        <p className="tiny faint" style={{ marginTop: 12, marginBottom: 0 }}>
          Step 2 of 2 — this is the last chance to back out.
        </p>
      )}
    </Sheet>
  )
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      <div className="tiny">{body}</div>
    </div>
  )
}
