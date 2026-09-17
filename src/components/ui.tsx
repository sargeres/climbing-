import { useEffect, useRef, type ReactNode } from 'react'
import { avatarColor, completionColor, gradeColor, initials } from '../lib/colors'
import { GRADES, type Climb, type Grade } from '../lib/types'
import { formatDurationShort } from '../lib/format'
import { gradeBreakdown } from '../lib/stats'

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
export function ClimbRow({ climb, onClick }: { climb: Climb; onClick?: () => void }) {
  const pctColor = completionColor(climb.completion)
  return (
    <button className="list-item" onClick={onClick} style={{ alignItems: 'stretch' }}>
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
          <span className="tiny" style={{ color: pctColor, fontWeight: 650, minWidth: 38, textAlign: 'right' }}>
            {climb.completion}%
          </span>
        </div>
        <div className="tiny faint" style={{ marginTop: 5 }}>
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

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      <div className="tiny">{body}</div>
    </div>
  )
}
