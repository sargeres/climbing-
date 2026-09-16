import { useState, type CSSProperties } from 'react'
import { GradePicker, Sheet } from './ui'
import { completionColor, effortColor, EFFORT_LABELS } from '../lib/colors'
import { EFFORT_MAX, EFFORT_MIN, type Grade } from '../lib/types'
import { formatDurationShort } from '../lib/format'

export interface ClimbDraft {
  grade: Grade
  problemName: string
  completion: number
  effort: number
}

const QUICK_PERCENTS = [25, 50, 75, 100]

export function LogClimbSheet({
  restSec,
  problemSuggestions,
  initial,
  title = 'Log attempt',
  submitLabel = 'Save attempt',
  onSubmit,
  onClose,
}: {
  /** Rest measured since the previous attempt; shown so it can be sanity-checked. */
  restSec?: number
  problemSuggestions?: string[]
  initial?: Partial<ClimbDraft>
  title?: string
  submitLabel?: string
  onSubmit: (draft: ClimbDraft) => void
  onClose: () => void
}) {
  const [grade, setGrade] = useState<Grade | null>(initial?.grade ?? null)
  const [problemName, setProblemName] = useState(initial?.problemName ?? '')
  const [completion, setCompletion] = useState(initial?.completion ?? 100)
  const [effort, setEffort] = useState(initial?.effort ?? 7)

  const submit = () => {
    if (!grade) return
    onSubmit({ grade, problemName: problemName.trim(), completion, effort })
  }

  const pctColor = completionColor(completion)

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="stack" style={{ gap: 20 }}>
        {restSec !== undefined && (
          <div className="tiny muted" style={{ marginTop: -8 }}>
            Rest before this attempt:{' '}
            <strong style={{ color: 'var(--text)' }}>{formatDurationShort(Math.round(restSec))}</strong>
          </div>
        )}

        <div className="field">
          <label>Grade</label>
          <GradePicker value={grade} onChange={setGrade} />
        </div>

        <div className="field">
          <label htmlFor="problem">Problem name (optional)</label>
          <input
            id="problem"
            className="input"
            value={problemName}
            placeholder="e.g. Red slab traverse"
            onChange={(e) => setProblemName(e.target.value)}
          />
          {problemSuggestions && problemSuggestions.length > 0 && (
            <div className="chips" style={{ marginTop: 4 }}>
              {problemSuggestions.map((name) => (
                <button key={name} className="chip" onClick={() => setProblemName(name)}>
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="field">
          <div className="spread">
            <label htmlFor="completion">Completed</label>
            <span className="pct-value" style={{ color: pctColor, fontSize: 32 }}>
              {completion}%
            </span>
          </div>
          <input
            id="completion"
            type="range"
            min={0}
            max={100}
            step={5}
            value={completion}
            onChange={(e) => setCompletion(Number(e.target.value))}
            style={{ '--pct': `${completion}%`, '--fill': pctColor } as CSSProperties}
          />
          <div className="chips">
            {QUICK_PERCENTS.map((pct) => (
              <button
                key={pct}
                className="chip"
                onClick={() => setCompletion(pct)}
                style={
                  completion === pct
                    ? { borderColor: completionColor(pct), color: completionColor(pct) }
                    : undefined
                }
              >
                {pct === 100 ? '100% — sent' : `${pct}%`}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <div className="spread">
            <label>Perceived effort</label>
            <span className="tiny" style={{ color: effortColor(effort), fontWeight: 650 }}>
              {effort}/10 · {EFFORT_LABELS[effort]}
            </span>
          </div>
          <div className="effort-grid">
            {Array.from({ length: EFFORT_MAX - EFFORT_MIN + 1 }, (_, i) => i + EFFORT_MIN).map((n) => {
              const selected = effort === n
              const color = effortColor(n)
              return (
                <button
                  key={n}
                  type="button"
                  className="effort-option"
                  aria-pressed={selected}
                  onClick={() => setEffort(n)}
                  style={
                    selected
                      ? { background: color, borderColor: color, color: '#0b0d12' }
                      : { borderColor: `${color}44`, color }
                  }
                >
                  {n}
                </button>
              )
            })}
          </div>
        </div>

        <button className="btn btn-primary btn-lg btn-block" disabled={!grade} onClick={submit}>
          {grade ? submitLabel : 'Pick a grade first'}
        </button>
      </div>
    </Sheet>
  )
}
