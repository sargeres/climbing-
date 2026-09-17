import { parseVideoUrl, type VideoRef } from '../lib/video'

function OpenLink({ video, note }: { video: VideoRef; note?: string }) {
  return (
    <a
      className="video-card"
      href={video.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
    >
      <span className="video-play" aria-hidden="true">
        ▶
      </span>
      <span className="list-main">
        <span className="list-title">Watch on {video.label}</span>
        <span className="tiny faint">{note ?? video.url.replace(/^https?:\/\//, '')}</span>
      </span>
      <span className="faint" aria-hidden="true">
        ↗
      </span>
    </a>
  )
}

/**
 * Renders a pasted link as an inline player where the platform allows it.
 *
 * The "open in app" link is always shown underneath rather than only on
 * failure: an Instagram post from a private account returns a frame we cannot
 * detect as broken from outside, and that link is the only thing that works
 * for it.
 */
export function VideoEmbed({ url }: { url: string }) {
  const video = parseVideoUrl(url)
  if (!video) return null

  if (!video.embedUrl) {
    return (
      <OpenLink
        video={video}
        note={
          video.label === 'TikTok' || video.label === 'Instagram' || video.label === 'YouTube'
            ? "Can't preview this one — opens in the app"
            : undefined
        }
      />
    )
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className={`video-frame${video.portrait ? ' portrait' : ''}`}>
        <iframe
          src={video.embedUrl}
          title={`${video.label} video`}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
      <OpenLink video={video} note={`Doesn't play? Open it on ${video.label}`} />
    </div>
  )
}
