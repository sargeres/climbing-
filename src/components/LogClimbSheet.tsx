import { useState, type CSSProperties } from 'react'
import { GradePicker, Sheet } from './ui'
import { completionColor, effortColor, EFFORT_LABELS } from '../lib/colors'
import { EFFORT_MAX, EFFORT_MIN, type Grade } from '../lib/types'
import { formatDurationShort } from '../lib/format'
import { parseVideoUrl } from '../lib/video'
import { VideoEmbed } from './VideoEmbed'

export interface ClimbDraft {
  grade: Grade
  problemName: string
  completion: number
  effort: number
  videoUrl: string
}

const QUICK_PERCENTS = [25, 50, 75, 100]

export function LogClimbSheet({
  restSec,
  climbSec,
  problemSuggestions,
  initial,
  title = 'Log attempt',
  submitLabel = 'Save attempt',
  onSubmit,
  onClose,
}: {
  /** Rest measured since the previous attempt; shown so it can be sanity-checked. */
  restSec?: number
  /** Time on the wall for this go, when it was timed. */
  climbSec?: number
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
  const [videoUrl, setVideoUrl] = useState(initial?.videoUrl ?? '')

  const trimmedUrl = videoUrl.trim()
  const video = trimmedUrl ? parseVideoUrl(trimmedUrl) : null
  const badUrl = trimmedUrl !== '' && video === null

  const submit = () => {
    if (!grade) return
    onSubmit({
      grade,
      problemName: problemName.trim(),
      completion,
      effort,
      // Store the parsed form so a stray space or missing scheme is fixed once.
      videoUrl: video ? video.url : '',
    })
  }

  const pctColor = completionColor(completion)

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="stack" style={{ gap: 20 }}>
        {(restSec !== undefined || climbSec !== undefined) && (
          <div className="row" style={{ marginTop: -8, gap: 16 }}>
            {climbSec !== undefined && climbSec > 0 && (
              <div className="tiny muted">
                On the wall:{' '}
                <strong style={{ color: 'var(--climb)' }}>
                  {formatDurationShort(Math.round(climbSec))}
                </strong>
              </div>
            )}
            {restSec !== undefined && (
              <div className="tiny muted">
                Rest before:{' '}
                <strong style={{ color: 'var(--text)' }}>
                  {formatDurationShort(Math.round(restSec))}
                </strong>
              </div>
            )}
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

        <div className="field">
          <label htmlFor="video">Video link (optional)</label>
          <input
            id="video"
            className="input"
            value={videoUrl}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Paste a YouTube, Instagram or TikTok link"
            onChange={(e) => setVideoUrl(e.target.value)}
            style={badUrl ? { borderColor: 'var(--danger)' } : undefined}
          />
          {badUrl ? (
            <span className="tiny" style={{ color: 'var(--danger)' }}>
              That doesn't look like a web link.
            </span>
          ) : video ? (
            <VideoEmbed url={video.url} />
          ) : (
            <span className="tiny faint">
              Host it wherever you already post — nothing is uploaded here.
            </span>
          )}
        </div>

        <button className="btn btn-primary btn-lg btn-block" disabled={!grade} onClick={submit}>
          {grade ? submitLabel : 'Pick a grade first'}
        </button>
      </div>
    </Sheet>
  )
}
