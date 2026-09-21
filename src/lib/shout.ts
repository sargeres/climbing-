/**
 * The shout that goes up when an attempt is logged.
 *
 * Climbing gyms are multilingual and the encouragement is the part everyone
 * borrows from everyone else — `allez` is French for "go" and gets yelled in
 * gyms that have never held a French conversation. So the app picks a language
 * at random each time and shouts in that one.
 *
 * Two registers, because the celebration fires on **every** logged attempt and
 * not only on a send. Telling someone "well done" after a 20% fall reads as
 * sarcasm, so a partial go gets the "keep going" word and a send gets the
 * "that was good" one.
 *
 * Speech goes through the browser's own synthesiser, which means no audio
 * files to ship and no licensing — but also that we can only say what the
 * device has a voice for. Rather than let a Korean phrase come out in an
 * English voice, `pickShout` only draws from languages the device can
 * actually pronounce. The word is always on screen regardless, so the feature
 * degrades to something legible rather than to nothing.
 */
export interface Shout {
  /** BCP-47 tag handed to the synthesiser. */
  lang: string
  /** What the language is called, for the caption. */
  label: string
  /** Shouted at a partial attempt — "keep going". */
  push: string
  /** Shouted at a send — "that was good". */
  praise: string
  /** Latin spelling, shown under a word in a non-Latin script. */
  roman?: string
  romanPraise?: string
}

export const SHOUTS: Shout[] = [
  { lang: 'fr-FR', label: 'French', push: 'Allez !', praise: 'Bravo !' },
  { lang: 'en-GB', label: 'English', push: 'Come on!', praise: 'Nice one!' },
  {
    lang: 'zh-CN',
    label: 'Mandarin',
    push: '加油',
    praise: '漂亮',
    roman: 'jiā yóu',
    romanPraise: 'piào liang',
  },
  {
    lang: 'zh-HK',
    label: 'Cantonese',
    push: '加油',
    praise: '好嘢',
    roman: 'gā yáu',
    romanPraise: 'hóu yé',
  },
  {
    lang: 'hi-IN',
    label: 'Hindi',
    push: 'चलो',
    praise: 'शाबाश',
    roman: 'chalo',
    romanPraise: 'shabash',
  },
  { lang: 'ms-MY', label: 'Malay', push: 'Ayuh!', praise: 'Boleh!' },
  {
    lang: 'ja-JP',
    label: 'Japanese',
    push: '頑張れ',
    praise: 'ナイス',
    roman: 'ganbare',
    romanPraise: 'naisu',
  },
  {
    lang: 'ko-KR',
    label: 'Korean',
    push: '화이팅',
    praise: '잘했어',
    roman: 'hwaiting',
    romanPraise: 'jalhaesseo',
  },
]

/** True when the word needs the device font rather than the pixel face. */
export const isNonLatin = (word: string): boolean => /[^\u0000-ɏ -⁯]/.test(word)

const synth = (): SpeechSynthesis | null =>
  typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null

/**
 * Voices arrive asynchronously on every browser that has them, and on Chrome
 * the first `getVoices()` after load is reliably empty. Warm them early so the
 * first shout of a session has the same choice as the tenth.
 */
export function primeVoices(): void {
  const s = synth()
  if (!s) return
  s.getVoices()
  s.addEventListener?.('voiceschanged', () => s.getVoices(), { once: true })
}

/** Languages this device can actually pronounce, matched on the base tag. */
export function speakableShouts(): Shout[] {
  const s = synth()
  if (!s) return []
  const voices = s.getVoices()
  if (voices.length === 0) return []
  const have = new Set(voices.map((v) => v.lang.replace('_', '-').toLowerCase()))
  const haveBase = new Set([...have].map((l) => l.split('-')[0]))
  return SHOUTS.filter((sh) => {
    const tag = sh.lang.toLowerCase()
    // zh-HK is its own voice where it exists; falling back to a Mandarin voice
    // would read the same characters with the wrong sounds, which is exactly
    // the mistake this filter is here to avoid.
    if (tag === 'zh-hk') return have.has('zh-hk') || have.has('yue-hk') || have.has('zh-yue')
    return have.has(tag) || haveBase.has(tag.split('-')[0])
  })
}

/**
 * Pick a language for this attempt.
 *
 * Prefers one the device can say out loud. When no voices exist at all — a
 * desktop Linux browser, or a phone before the list has loaded — it still
 * returns a shout so the word appears on screen and the chime carries the
 * moment.
 */
export function pickShout(exclude?: string): { shout: Shout; speakable: boolean } {
  const speakable = speakableShouts()
  const pool = speakable.length > 0 ? speakable : SHOUTS
  const choices = pool.length > 1 && exclude ? pool.filter((s) => s.lang !== exclude) : pool
  const list = choices.length > 0 ? choices : pool
  return {
    shout: list[Math.floor(Math.random() * list.length)],
    speakable: speakable.length > 0,
  }
}

/** The word for this attempt: praise on a send, encouragement otherwise. */
export const wordFor = (shout: Shout, sent: boolean): string =>
  sent ? shout.praise : shout.push

export const romanFor = (shout: Shout, sent: boolean): string | undefined =>
  sent ? shout.romanPraise : shout.roman

/**
 * Say it. Returns false when nothing was spoken, so the caller can fall back
 * to the chime rather than leaving the moment silent.
 */
export function speakShout(shout: Shout, sent: boolean): boolean {
  const s = synth()
  if (!s) return false
  const voices = s.getVoices()
  const tag = shout.lang.toLowerCase()
  const norm = (l: string) => l.replace('_', '-').toLowerCase()
  const voice =
    voices.find((v) => norm(v.lang) === tag) ??
    voices.find((v) => norm(v.lang).split('-')[0] === tag.split('-')[0]) ??
    null
  if (!voice) return false
  try {
    // Anything still queued is a shout from an attempt already celebrated.
    s.cancel()
    const u = new SpeechSynthesisUtterance(wordFor(shout, sent))
    u.voice = voice
    u.lang = voice.lang
    u.rate = 1.05
    u.pitch = 1.1
    u.volume = 1
    s.speak(u)
    return true
  } catch {
    return false
  }
}
