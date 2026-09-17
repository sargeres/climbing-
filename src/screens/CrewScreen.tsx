import { useCallback, useEffect, useRef, useState } from 'react'
import { EmptyState, GradePill, TopBar } from '../components/ui'
import { VideoEmbed } from '../components/VideoEmbed'
import { completionColor } from '../lib/colors'
import { formatDurationShort, formatRelativeDay } from '../lib/format'
import {
  addComment,
  createCrew,
  crewLink,
  fetchComments,
  fetchFeed,
  joinCrew,
  readIdentity,
  writeIdentity,
  type CrewComment,
  type CrewIdentity,
  type CrewPost,
} from '../lib/crew'
import type { Grade } from '../lib/types'

function Setup({
  presetCode,
  onJoined,
}: {
  presetCode: string | null
  onJoined: (identity: CrewIdentity) => void
}) {
  const [mode, setMode] = useState<'join' | 'create'>(presetCode ? 'join' : 'create')
  const [name, setName] = useState('')
  const [crewName, setCrewName] = useState('')
  const [code, setCode] = useState(presetCode ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const go = async () => {
    setBusy(true)
    setError(null)
    const result =
      mode === 'create'
        ? await createCrew(crewName, name)
        : await joinCrew(code, name)
    setBusy(false)
    if (result.ok) {
      writeIdentity(result.value)
      onJoined(result.value)
    } else {
      setError(result.error)
    }
  }

  const ready =
    name.trim() !== '' && (mode === 'create' ? crewName.trim() !== '' : code.trim() !== '')

  return (
    <main className="content">
      {presetCode && (
        <div className="card" style={{ borderColor: 'var(--brand-dim)' }}>
          <div className="section-label">You've been invited</div>
          <p className="tiny muted" style={{ margin: '6px 0 0' }}>
            Pick a name your friends will recognise and you're in. No email, no password.
          </p>
        </div>
      )}

      <div className="row" style={{ gap: 8 }}>
        <button
          className={`btn btn-block${mode === 'create' ? ' btn-primary' : ''}`}
          onClick={() => setMode('create')}
        >
          Start a crew
        </button>
        <button
          className={`btn btn-block${mode === 'join' ? ' btn-primary' : ''}`}
          onClick={() => setMode('join')}
        >
          Join one
        </button>
      </div>

      <div className="field">
        <label htmlFor="crew-display-name">Your name</label>
        <input
          id="crew-display-name"
          className="input"
          value={name}
          placeholder="How your friends know you"
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {mode === 'create' ? (
        <div className="field">
          <label htmlFor="crew-name">Crew name</label>
          <input
            id="crew-name"
            className="input"
            value={crewName}
            placeholder="e.g. Thursday Crew"
            onChange={(e) => setCrewName(e.target.value)}
          />
        </div>
      ) : (
        <div className="field">
          <label htmlFor="crew-code">Invite code</label>
          <input
            id="crew-code"
            className="input"
            value={code}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Paste the code from your invite"
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
      )}

      {error && <div className="error-note">{error}</div>}

      <button className="btn btn-primary btn-lg btn-block" disabled={!ready || busy} onClick={go}>
        {busy ? 'Working…' : mode === 'create' ? 'Create crew' : 'Join crew'}
      </button>

      <p className="tiny faint" style={{ margin: 0 }}>
        Anything you share goes to everyone holding the crew link. Your session log itself stays on
        this phone.
      </p>
    </main>
  )
}

function PostCard({
  post,
  comments,
  identity,
  onCommented,
}: {
  post: CrewPost
  comments: CrewComment[]
  identity: CrewIdentity
  onCommented: (comment: CrewComment) => void
}) {
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async () => {
    if (!body.trim()) return
    setBusy(true)
    setError(null)
    const result = await addComment(identity, post.id, body)
    setBusy(false)
    if (result.ok) {
      onCommented(result.value)
      setBody('')
    } else {
      setError(result.error)
    }
  }

  return (
    <div className="card stack">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <GradePill grade={post.grade as Grade} />
        <div className="list-main">
          <div className="list-title">{post.problem_name.trim() || 'Unnamed problem'}</div>
          <div className="tiny faint">
            {post.author_name}
            {post.climber_name && post.climber_name !== post.author_name && ` · ${post.climber_name}`}
            {post.venue && ` · ${post.venue}`} · {formatRelativeDay(new Date(post.climbed_at).getTime())}
          </div>
        </div>
        <span
          className="tiny"
          style={{ color: completionColor(post.completion), fontWeight: 700, flex: 'none' }}
        >
          {post.completion}%
        </span>
      </div>

      {post.video_url && <VideoEmbed url={post.video_url} />}

      <div className="tiny faint">
        Effort {post.effort}/10
        {post.climb_sec > 0 && ` · ${formatDurationShort(post.climb_sec)} on the wall`}
      </div>

      <button className="btn btn-ghost" style={{ justifyContent: 'flex-start' }} onClick={() => setOpen((o) => !o)}>
        {comments.length === 0
          ? 'Add a comment'
          : `${comments.length} comment${comments.length === 1 ? '' : 's'}`}
      </button>

      {open && (
        <div className="stack" style={{ gap: 10 }}>
          {comments.map((c) => (
            <div key={c.id} className="comment">
              <div className="tiny" style={{ fontWeight: 650 }}>
                {c.author_name}
              </div>
              <div className="tiny muted">{c.body}</div>
            </div>
          ))}
          <div className="row" style={{ gap: 8 }}>
            <input
              className="input"
              value={body}
              placeholder="Beta, or just encouragement"
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void send()}
            />
            <button className="btn" disabled={!body.trim() || busy} onClick={send}>
              {busy ? '…' : 'Send'}
            </button>
          </div>
          {error && <div className="error-note">{error}</div>}
        </div>
      )}
    </div>
  )
}

export function CrewScreen({ onBack, presetCode }: { onBack: () => void; presetCode: string | null }) {
  const [identity, setIdentity] = useState<CrewIdentity | null>(() => readIdentity())
  const [posts, setPosts] = useState<CrewPost[]>([])
  const [comments, setComments] = useState<CrewComment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async (crewId: string) => {
    setLoading(true)
    setError(null)
    const feed = await fetchFeed(crewId)
    if (!feed.ok) {
      setError(feed.error)
      setLoading(false)
      return
    }
    setPosts(feed.value)
    const withComments = await fetchComments(feed.value.map((p) => p.id))
    if (withComments.ok) setComments(withComments.value)
    setLoading(false)
  }, [])

  // Runs once per crew rather than on every render: `load` is stable and the
  // identity only changes when someone joins or leaves.
  const loadedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!identity || loadedFor.current === identity.crewId) return
    loadedFor.current = identity.crewId
    void load(identity.crewId)
  }, [identity, load])

  if (!identity) {
    return (
      <>
        <TopBar title="Crew" onBack={onBack} />
        <Setup presetCode={presetCode} onJoined={setIdentity} />
      </>
    )
  }

  const share = async () => {
    const url = crewLink(identity.joinCode)
    try {
      if (navigator.share) {
        await navigator.share({ title: `Join ${identity.crewName} on Sendlog`, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* the share sheet was dismissed, which is not a failure */
    }
  }

  return (
    <>
      <TopBar
        title={identity.crewName}
        subtitle={`as ${identity.displayName}`}
        onBack={onBack}
        action={
          <button className="btn btn-ghost" onClick={() => void load(identity.crewId)}>
            {loading ? '…' : 'Refresh'}
          </button>
        }
      />
      <main className="content">
        <button className="btn btn-block" onClick={share}>
          {copied ? 'Link copied' : 'Invite a friend'}
        </button>

        {error && <div className="error-note">{error}</div>}

        {loading && posts.length === 0 && <div className="muted tiny">Loading the board…</div>}

        {!loading && posts.length === 0 && !error && (
          <EmptyState
            title="Nothing on the board yet"
            body="Share an attempt from a session and it shows up here for everyone with the link."
          />
        )}

        <div className="stack">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              identity={identity}
              comments={comments.filter((c) => c.post_id === post.id)}
              onCommented={(c) => setComments((all) => [...all, c])}
            />
          ))}
        </div>

        <button
          className="btn btn-danger btn-block"
          onClick={() => {
            writeIdentity(null)
            loadedFor.current = null
            setIdentity(null)
            setPosts([])
            setComments([])
          }}
        >
          Leave crew on this device
        </button>
      </main>
    </>
  )
}
