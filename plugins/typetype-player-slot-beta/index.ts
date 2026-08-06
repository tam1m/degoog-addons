// === Video ID Extraction (shared with engine — separate runtime contexts) ===

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`)
}

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/
const BILIBILI_ID_RE = /^BV[A-Za-z0-9]{10}$/i
const NICONICO_ID_RE = /^sm\d+$/i

/** Strip trailing query params, fragments, or other junk from a candidate ID. */
function cleanId(raw: string | undefined): string | undefined {
  return raw?.split(/[?&#]/)[0]
}

function extractYouTubeId(url: string): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    if (host === "youtu.be") {
      const segments = parsed.pathname.split("/").filter(Boolean)
      const candidate = cleanId(segments[0])
      return candidate && YOUTUBE_ID_RE.test(candidate) ? candidate : null
    }
    if (hostMatches(host, "youtube.com")) {
      const vParam = parsed.searchParams.get("v")
      if (vParam) {
        const clean = cleanId(vParam)
        if (YOUTUBE_ID_RE.test(clean)) return clean
      }
      const segments = parsed.pathname.split("/").filter(Boolean)
      const nested = segments[0] === "shorts" || segments[0] === "embed" || segments[0] === "live"
      const candidate = cleanId(nested ? segments[1] : segments[0])
      return candidate && YOUTUBE_ID_RE.test(candidate) ? candidate : null
    }
    return null
  } catch { return null }
}

function extractBilibiliId(url: string): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (!hostMatches(parsed.hostname.toLowerCase(), "bilibili.com")) return null
    const segments = parsed.pathname.split("/").filter(Boolean)
    const candidate = cleanId(segments[0] === "video" ? segments[1] : null)
    return candidate && BILIBILI_ID_RE.test(candidate) ? candidate : null
  } catch { return null }
}

function extractNiconicoId(url: string): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (!hostMatches(parsed.hostname.toLowerCase(), "nicovideo.jp")) return null
    const segments = parsed.pathname.split("/").filter(Boolean)
    const candidate = cleanId(segments[0] === "watch" ? segments[1] : null)
    return candidate && NICONICO_ID_RE.test(candidate) ? candidate : null
  } catch { return null }
}

function extractTypeTypeId(url: string): string | null {
  if (!url) return null
  try {
    const parsed = url.includes("://") ? new URL(url) : new URL(url, "https://_")
    const vParam = parsed.searchParams.get("v")
    if (vParam) return cleanId(vParam) ?? null
    const segments = parsed.pathname.split("/").filter(Boolean)
    if (segments[0] === "embed" && segments[1]) return cleanId(segments[1]) ?? null
    return null
  } catch { return null }
}

function extractVideoId(url: string): { id: string; service: string } | null {
  const biliId = extractBilibiliId(url)
  if (biliId) return { id: biliId, service: "bilibili" }
  const nicoId = extractNiconicoId(url)
  if (nicoId) return { id: nicoId, service: "niconico" }
  const ytId = extractYouTubeId(url)
  if (ytId) return { id: ytId, service: "youtube" }
  const ttId = extractTypeTypeId(url)
  if (ttId) return { id: ttId, service: "typetype" }
  return null
}

function isBareVideoId(query: string): boolean {
  return YOUTUBE_ID_RE.test(query)
    || BILIBILI_ID_RE.test(query)
    || NICONICO_ID_RE.test(query)
}

const CHANNEL_HANDLE_RE = /^@[\w.-]{3,30}$/i

function isChannelHandle(query: string): boolean {
  return CHANNEL_HANDLE_RE.test(query)
}

const PLATFORM_PREFIX_RE = /^(yt|v|bilibili|b站|nico|niconico)\s/i

function hasPlatformPrefix(query: string): boolean {
  return PLATFORM_PREFIX_RE.test(query)
}

// === Text normalization (shared with similarity gate) ===

function normalizeText(value: string): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

// === NLP Heuristic Intent Scoring (adapted from new_algo/src/algo.ts) ===

interface IntentScore {
  score: number
  confidence: "HIGH" | "MEDIUM" | "LOW"
  signals: string[]
}

// Tokens that explicitly signal video intent
const EXPLICIT_TRIGGERS = new Set([
  "youtube", "yt", "shorts", "vlog", "vlogs",
  "bilibili", "b站", "bv",
  "niconico", "nico", "ニコニコ",
  "video", "videos", "channel", "streamer",
])

// Content formats strongly associated with video
const FORMAT_TRIGGERS = new Set([
  "trailer", "trailers", "teaser", "tutorial", "tutorials", "unboxing", "unboxings",
  "asmr", "compilation", "compilations", "podcast", "podcasts", "livestream", "live",
  "stream", "streams", "highlight", "highlights", "montage", "cutscenes", "speedbuild",
  "timelapse", "skit", "bloopers", "gameplay", "walkthrough", "walkthroughs", "speedrun",
  "playthrough", "longplay", "letplay", "vod", "vods", "recap", "recaps", "mixtape",
  "instrumental", "karaoke", "lyrics", "clip", "clips", "bts", "mad", "mmd", "pv", "op", "ed",
  "review", "reviews", "reaction", "reactions", "benchmark", "tierlist", "teardown",
  "unplugged", "acoustic", "concert",
])

// Topics where video is the dominant medium
const VISUAL_DOMAINS = new Set([
  "workout", "yoga", "pilates", "dumbbells", "abs", "fitness", "exercise", "stretching",
  "makeup", "skincare", "haul", "swatches", "routine",
  "ufc", "nba", "nfl", "wwe", "espn", "touchdowns",
  "vtuber",
])

// Verbs that imply visual demonstration
const VISUAL_INSTRUCTION_VERBS = new Set([
  "draw", "cook", "bake", "tie", "repair", "fix", "build", "replace",
  "clean", "sew", "fold", "origami", "knit", "crochet", "exercise",
  "dance", "braid", "paint", "sculpt", "install", "setup", "troubleshoot",
])

// Action verbs that often precede a video search
const ACTION_VERBS = new Set(["watch", "listen", "play"])

// Known creator handles and entities
const KNOWN_ENTITIES = new Set([
  "mkbhd", "pewdiepie", "mrbeast", "veritasium", "kurzgesagt",
  "linustechtips", "lexfridman", "nijisanji", "hololive",
  "markiplier", "jacksepticeye",
])

// Low-weight modifiers — hint at video but not definitive
const WEAK_MODIFIERS = new Set([
  "guide", "guides", "tour", "vs", "versus", "cover", "covers",
  "remix", "diy", "overview", "ending", "boss",
])

// Tokens that strongly suggest non-video intent
const NEGATIVE_TRIGGERS = new Set([
  "pdf", "download", "login", "weather", "calculator", "dictionary",
  "define", "definition", "buy", "price", "cheap", "tickets", "map", "wiki",
  "wikipedia", "docs", "documentation", "api", "npm", "github",
  "stackoverflow", "error", "exception", "bug", "issue", "pip",
  "cheatsheet", "changelog", "repo", "sourcecode", "zillow", "flights",
  "book", "ebook", "article", "news", "shop", "store",
])

// Phrase-level patterns for high-value video intent signals
interface PhrasePattern {
  regex: RegExp
  weight: number
  name: string
}

const PHRASE_PATTERNS: PhrasePattern[] = [
  { regex: /\bhow to\b/i, weight: 0.50, name: "phrase:how_to" },
  { regex: /\bhow to (make|fix|build|draw|cook|play|tie|repair|change|replace|clean|sew|fold|knit|dance)\b/i, weight: 0.85, name: "phrase:how_to_physical" },
  { regex: /\b(full movie|full episode|season \d+ episode \d+|music video|official video|official audio|live performance|dance practice)\b/i, weight: 0.95, name: "phrase:media" },
  { regex: /\b(hands on review|drop test|camera test|speed test|sound test|no commentary|let's play|lets play)\b/i, weight: 0.85, name: "phrase:niche_format" },
  { regex: /\b(8d audio|slowed and reverb|nightcore|bass boosted)\b/i, weight: 0.90, name: "phrase:audio_variant" },
  { regex: /\b(\d+\s*min\s+(workout|yoga|stretching|routine|exercise))\b/i, weight: 0.90, name: "phrase:fitness_routine" },
  { regex: /\b(long term review|after \d+ months|series finale reaction)\b/i, weight: 0.85, name: "phrase:extended" },
]

function computeVideoIntentScore(rawQuery: string): IntentScore {
  const safeQuery = rawQuery.toLowerCase().replace(/['']/g, "")
  const normalizedQuery = safeQuery.replace(/[^\w\s\u4e00-\u9fa5\u3040-\u30ff]/gi, " ").trim()
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean)

  let score = 0.0
  const signals: string[] = []

  // 1. Phrase patterns — multi-word signals (operate on full query, not tokens)
  let howToPhysicalMatched = false
  for (const pattern of PHRASE_PATTERNS) {
    if (pattern.regex.test(normalizedQuery)) {
      if (pattern.name === "phrase:how_to" && howToPhysicalMatched) continue
      score += pattern.weight
      signals.push(pattern.name)
      if (pattern.name === "phrase:how_to_physical") howToPhysicalMatched = true
    }
  }

  // 2. Single-pass token evaluation — priority order, one match per token
  for (const token of tokens) {
    if (NEGATIVE_TRIGGERS.has(token)) {
      score -= 0.80; signals.push(`negative:${token}`)
    } else if (KNOWN_ENTITIES.has(token)) {
      score += 0.85; signals.push(`entity:${token}`)
    } else if (EXPLICIT_TRIGGERS.has(token)) {
      score += 1.00; signals.push(`explicit:${token}`)
    } else if (FORMAT_TRIGGERS.has(token)) {
      score += 0.80; signals.push(`format:${token}`)
    } else if (VISUAL_DOMAINS.has(token)) {
      score += 0.75; signals.push(`domain:${token}`)
    } else if (VISUAL_INSTRUCTION_VERBS.has(token)) {
      score += 0.45; signals.push(`visual_verb:${token}`)
    } else if (token === "watch" && !safeQuery.includes("smartwatch")) {
      score += 0.45; signals.push("action:watch")
    } else if (ACTION_VERBS.has(token)) {
      score += 0.45; signals.push(`action:${token}`)
    } else if (WEAK_MODIFIERS.has(token)) {
      score += 0.30; signals.push(`modifier:${token}`)
    }
  }

  const finalScore = Number(Math.max(-3.0, Math.min(3.0, score)).toFixed(2))

  let confidence: "HIGH" | "MEDIUM" | "LOW" = "LOW"
  if (finalScore >= 0.80) {
    confidence = "HIGH"
  } else if (finalScore >= 0.45) {
    confidence = "MEDIUM"
  }

  return { score: finalScore, confidence, signals }
}

// === Similarity Gate (tiebreaker for MEDIUM/LOW confidence queries) ===

function matchesQuery(query: string, title: string): boolean {
  const q = normalizeText(query)
  const t = normalizeText(title)
  if (!q || !t) return false
  if (q === t) return true

  const queryWords = q.split(/\s+/).filter(Boolean)
  if (queryWords.length === 0) return false
  if (queryWords.length === 1) return false // single words too ambiguous

  if (t.includes(q) || q.includes(t)) return true

  const titleWords = new Set(t.split(/\s+/).filter(Boolean))
  return queryWords.every(w => titleWords.has(w))
}

function queryMatchesChannel(query: string, source: string): boolean {
  const uploader = (source ?? "").replace(/\s*\/\s*TypeType$/, "").trim()
  if (!uploader) return false
  const q = normalizeText(query)
  const ch = normalizeText(uploader)
  const queryWords = q.split(/\s+/).filter(Boolean)
  if (queryWords.length === 1) return ch === q || ch.includes(q)
  return ch === q || q.includes(ch)
}

// === Direct TypeType API (fallback when degoog results aren't available) ===

/** Wire a local AbortController to degoog's parent AbortSignal. Returns a cleanup function. */
function wireAbort(controller: AbortController, context: any): () => void {
  const ps = context?.signal
  if (!ps) return () => {}
  const forward = () => controller.abort(ps.reason)
  if (ps.aborted) { forward(); return () => {} }
  ps.addEventListener("abort", forward, { once: true })
  return () => ps.removeEventListener("abort", forward)
}

/** Slim subset of VideoItem — only the fields the slot rendering needs. */
interface TypeTypeSearchItem {
  url: string
  title: string
  thumbnailUrl: string
  uploaderName: string
  duration: number
}

/**
 * Build a properly-encoded TypeType API URL.
 * Uses the same `new URL()` + `searchParams` pattern as the new algo
 * to avoid manual string-splicing and encoding pitfalls.
 */
function buildTypeTypeApiUrl(
  instanceUrl: string,
  path: string,
  params: Record<string, string>,
): string {
  const base = instanceUrl.replace(/\/+$/, "")
  const url = new URL(path, base + "/" /* ensure trailing slash for relative resolve */)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return url.toString()
}

/**
 * Validate a bare video ID and return its metadata if found.
 * For unambiguous IDs (BV, sm) uses the stream endpoint (~200ms).
 * For ambiguous 11-char IDs, uses search to discover the service.
 * Returns a NormalizedItem with title/thumbnail if valid, null if not.
 */
async function validateBareVideoId(
  id: string,
  instanceUrl: string,
  context: any,
): Promise<NormalizedItem | null> {
  // Bilibili BV and Niconico sm patterns are unambiguous — stream check is fast
  if (BILIBILI_ID_RE.test(id)) {
    const url = await streamCheck(instanceUrl, `https://www.bilibili.com/video/${id}`, "api/streams/bilibili", context)
    return url ? { url, title: "" } : null
  }
  if (NICONICO_ID_RE.test(id)) {
    const url = await streamCheck(instanceUrl, `https://www.nicovideo.jp/watch/${id}`, "api/streams/niconico", context)
    return url ? { url, title: "" } : null
  }

  // 11-char pattern is ambiguous (YouTube, Bilibili, Niconico, or none).
  // Use search to discover what service this ID belongs to — and get metadata.
  const results = await fetchTypeTypeSearch(id, instanceUrl, context)
  if (results && results.length > 0) {
    for (const item of results) {
      const extracted = extractVideoId(item.url)
      if (extracted && extracted.id === id) return fromTypeTypeItem(item)
    }
  }

  // Fallback: try YouTube stream check for IDs that look like real YT IDs
  // (mixed case + numbers, not all-lowercase dictionary words)
  if (/[A-Z0-9_-]/.test(id) && /[a-z]/.test(id)) {
    const url = await streamCheck(instanceUrl, `https://www.youtube.com/watch?v=${id}`, "api/streams/youtube/sabr/bootstrap", context)
    return url ? { url, title: "" } : null
  }

  return null
}

async function streamCheck(
  instanceUrl: string,
  upstreamUrl: string,
  streamPath: string,
  context: any,
): Promise<string | null> {
  const doFetch = context?.fetch ?? fetch
  const url = buildTypeTypeApiUrl(instanceUrl, streamPath, { url: upstreamUrl })

  const controller = new AbortController()
  const cleanup = wireAbort(controller, context)

  try {
    const response = await doFetch(url, { signal: controller.signal })
    return response.ok ? upstreamUrl : null
  } catch {
    return null
  } finally {
    cleanup()
  }
}

/**
 * Fetch search results directly from the TypeType instance.
 * Applies degoog runtime patterns: context.fetch, context.sentinel,
 * AbortSignal forwarding.
 *
 * Returns items on success, `undefined` on any non-sentinel failure.
 */
async function fetchTypeTypeSearch(
  query: string,
  instanceUrl: string,
  context: any,
  serviceId = 0,
): Promise<TypeTypeSearchItem[] | undefined> {
  const doFetch = context?.fetch ?? fetch
  const url = buildTypeTypeApiUrl(instanceUrl, "api/search", {
    q: query,
    service: String(serviceId),
  })

  const controller = new AbortController()
  const cleanup = wireAbort(controller, context)

  try {
    const response = await doFetch(url, { signal: controller.signal })
    context?.sentinel?.(response, "TypeTypePlayer")

    const data: any = await response.json()
    const items: any[] = data?.items ?? []

    return items.map((item: any): TypeTypeSearchItem => ({
      url: item.url ?? "",
      title: item.title ?? "",
      thumbnailUrl: item.thumbnailUrl ?? "",
      uploaderName: item.uploaderName ?? "",
      duration: item.duration ?? 0,
    }))
  } catch (e: any) {
    if (e?.name === "SentinelBreach") throw e
    return undefined
  } finally {
    cleanup()
  }
}

/** Build a render-data record from a normalized item + extracted video ID. */
interface NormalizedItem {
  url: string
  title: string
  thumbnail?: string
  uploader?: string
  duration?: string  // pre-formatted (e.g. "3:42"), empty if unavailable
}

function toRenderData(item: NormalizedItem, videoId: string, instanceUrl: string): Record<string, string> {
  const embedUrl = buildTypeTypeApiUrl(instanceUrl, `embed/${videoId}`, { autoplay: "1" })
  const watchUrl = buildTypeTypeApiUrl(instanceUrl, "watch", { v: videoId })
  const meta = [item.uploader || null, item.duration || null].filter(Boolean).join(" · ")

  return {
    id: videoId,
    title: item.title,
    embedUrl,
    watchUrl,
    thumbnail: item.thumbnail ?? "",
    uploader: item.uploader ?? "",
    meta,
  }
}

function formatDuration(seconds: number): string | undefined {
  if (!seconds || seconds <= 0 || Number.isNaN(seconds)) return undefined
  const t = Math.floor(seconds)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`
  return `${m}:${pad(s)}`
}

/** Map a degoog engine result into the normalized item shape. */
function fromDegoogResult(r: any): NormalizedItem {
  const uploader = (r.source ?? "").replace(/\s*\/\s*TypeType$/, "").trim()
  return {
    url: r.url ?? "",
    title: r.title ?? "",
    thumbnail: r.thumbnail ?? "",
    uploader: uploader || undefined,
    duration: r.duration ?? undefined,  // already formatted by engine
  }
}

/** Map a TypeType API result into the normalized item shape. */
function fromTypeTypeItem(item: TypeTypeSearchItem): NormalizedItem {
  return {
    url: item.url,
    title: item.title,
    thumbnail: item.thumbnailUrl,
    uploader: item.uploaderName || undefined,
    duration: formatDuration(item.duration),
  }
}

// === Slot Object ===

export const slot = {
  id: "typetype-player-slot-beta",
  name: "TypeType Inline Player (Beta)",
  description: "Beta slot with NLP intent detection for smarter activation.",
  position: "above-results",
  waitForResults: true,
  gridSize: 3,
  isClientExposed: false,

  instanceUrl: "",
  resultSource: "both" as "both" | "degoog" | "typetype",
  debug: false,
  _template: "",

  settingsSchema: [
    {
      key: "instanceUrl",
      label: "Instance URL",
      type: "url",
      required: true,
      placeholder: "https://watch.example.com",
      description: "Your self-hosted TypeType server URL (without /api).",
    },
    {
      key: "resultSource",
      label: "Result source",
      type: "select",
      options: ["both", "degoog", "typetype"],
      default: "both",
      description:
        "both = prefer degoog engine results, fall back to direct TypeType API. " +
        "degoog = only use engine results (needs TypeType engine enabled). " +
        "typetype = only query TypeType API directly.",
    },
    {
      key: "debug",
      label: "Show debug stats",
      type: "toggle",
      default: false,
      description: "Append performance and scoring details to the player card.",
    },
  ],

  configure(settings: Record<string, any>) {
    if (typeof settings.instanceUrl === "string")
      this.instanceUrl = settings.instanceUrl.trim().replace(/\/+$/, "")
    if (typeof settings.resultSource === "string" &&
        ["both", "degoog", "typetype"].includes(settings.resultSource))
      this.resultSource = settings.resultSource
    // Accept any truthy representation for debug (degoog may send bool, string, or number)
    if ("debug" in settings) {
      const v = settings.debug
      this.debug = v === true || v === "true" || v === 1 || v === "1"
    }
  },

  init(ctx: any) {
    this._template = ctx?.template ?? ""
  },

  /**
   * Coarse gate: fast NLP check to avoid activating the slot for
   * queries that are clearly not video-related.
   *
   * Returns false only when negative signals dominate with no
   * counterbalancing positives. Everything else passes through
   * to execute() where the similarity gate can make a more
   * informed decision using actual search results.
   */
  async trigger(query: string): Promise<boolean> {
    const trimmed = query.trim()
    if (!trimmed) return false

    // Fast-paths: always activate for deterministic video queries
    if (trimmed.includes("://")) return true
    if (isBareVideoId(trimmed)) return true
    if (isChannelHandle(trimmed)) return true
    if (hasPlatformPrefix(trimmed)) return true

    // NLP heuristic check
    const { score } = computeVideoIntentScore(trimmed)

    // Single-word queries with no video signals are too ambiguous
    if (!trimmed.includes(" ") && score <= 0) return false

    // Block only when negatives clearly dominate (net score < -0.50).
    // At -0.50, there are negative triggers with at most one weak
    // positive — not worth activating the slot.
    if (score < -0.50) return false

    // Let everything else through — the similarity gate in execute()
    // will make the final call using actual search results.
    return true
  },

  /**
   * Three-tier rendering:
   * 1. URL / bare ID → render immediately (no results needed)
   * 2. HIGH confidence NLP → skip similarity, take first valid result
   * 3. MEDIUM / LOW confidence → run similarity gate
   *
   * Results come from context.results (degoog engine output) when available,
   * falling back to a direct TypeType API call when the engine hasn't run.
   */
  async execute(query: string, context: any): Promise<{ title?: string; html: string }> {
    if (!this.instanceUrl) return { html: "" }

    const t0 = Date.now()
    const debug: Record<string, string> = {}

    const render = (data: Record<string, string>): string => {
      let html = this._template || '<div class="typetype-beta">{{title}}{{#debugInfo}}<div class="typetype-beta-debug">{{debugInfo}}</div>{{/debugInfo}}</div>'
      for (const [key, value] of Object.entries(data)) {
        html = html.replace(new RegExp(`\{\{\s*${key}\s*\}\}`, "g"), value ?? "")
        html = html.replace(
          new RegExp(`\{\{\s*#${key}\s*\}\\}([\\s\\S]*?)\\{\{\\s*/${key}\s*\}\\}`, "g"),
          value ? "$1" : ""
        )
      }
      return html.replace(/\{\{\s*[#/]?\w+\s*\}\}/g, "")
    }

    const finish = (data: Record<string, string> | null): { html: string } => {
      if (!data) return { html: "" }
      debug.totalMs = String(Date.now() - t0)
      data.debugInfo = ""
      if (this.debug) {
        data.debugInfo = [
          debug.score ? `score ${debug.score} (${debug.confidence ?? "?"})` : null,
          debug.source ? `src ${debug.source}` : null,
          debug.tier ? `tier ${debug.tier}` : null,
          `${debug.totalMs}ms`,
          debug.items != null ? `${debug.items} items` : null,
          debug.apiMs ? `api ${debug.apiMs}ms` : null,
          debug.signals ? `signals: ${debug.signals}` : null,
          debug.simMatch ? `sim:${debug.simMatch}` : null,
        ].filter(Boolean).join(" · ")
      }
      return { html: render(data) }
    }

    const trimmed = query.trim()
    if (!trimmed) return finish(null)

    // --- Tier 1: URL → render with metadata fetch ---
    // Also handle URLs missing the scheme (e.g. "youtube.com/watch?v=...")
    let urlQuery = trimmed
    if (!urlQuery.includes("://") && /^[\w-]+\.[a-z]{2,}[/?#]/.test(urlQuery)) {
      urlQuery = "https://" + urlQuery
    }

    if (urlQuery.includes("://")) {
      const extracted = extractVideoId(urlQuery)
      if (!extracted) return finish(null)
      debug.tier = "1"; debug.source = "url"

      // Fetch metadata so the card has a title and thumbnail
      const results = await fetchTypeTypeSearch(extracted.id, this.instanceUrl, context)
      if (results && results.length > 0) {
        for (const item of results) {
          const itemId = extractVideoId(item.url)
          if (itemId && itemId.id === extracted.id) {
            return finish(toRenderData(fromTypeTypeItem(item), extracted.id, this.instanceUrl))
          }
        }
      }

      // Fallback: render without metadata (player still works)
      return finish(toRenderData({ url: "", title: "" }, extracted.id, this.instanceUrl))
    }

    if (isChannelHandle(trimmed)) {
      // Handles need search results to find the actual video — fall through
    }

    // --- Tier 2: Bare video IDs (11-char, BV, sm) and TypeType ?v= → validate ---
    let candidateId: string | null = null

    if (isBareVideoId(trimmed)) {
      candidateId = trimmed
    } else {
      // Also catch watch?v= or /embed/ bare IDs that look like video IDs
      const ttId = extractTypeTypeId(trimmed)
      if (ttId && isBareVideoId(ttId)) {
        candidateId = ttId
      }
    }

    if (candidateId) {
      const item = await validateBareVideoId(candidateId, this.instanceUrl, context)
      if (item) {
        debug.tier = "2"; debug.source = "validated"
        return finish(toRenderData(item, candidateId, this.instanceUrl))
      }
      return finish(null)
    }

    // --- Tier 3: NLP + results for text queries ---
    const intent = computeVideoIntentScore(trimmed)
    debug.score = String(intent.score)
    debug.confidence = intent.confidence
    debug.signals = intent.signals.slice(0, 5).join(", ")

    let items: NormalizedItem[] = []
    let sourceLabel = "none"
    let apiFetchMs = 0

    if (this.resultSource === "degoog" || this.resultSource === "both") {
      items = (context?.results ?? [])
        .filter((r: any) => typeof r.source === "string" && r.source.endsWith("/ TypeType"))
        .map(fromDegoogResult)
      if (items.length > 0) sourceLabel = "degoog"
    }

    if (items.length === 0 && (this.resultSource === "typetype" || this.resultSource === "both")) {
      const tApi = Date.now()
      const directResults = await fetchTypeTypeSearch(trimmed, this.instanceUrl, context)
      apiFetchMs = Date.now() - tApi
      if (directResults && directResults.length > 0) {
        items = directResults.map(fromTypeTypeItem)
        sourceLabel = "typetype"
      }
    }

    debug.source = sourceLabel
    debug.items = String(items.length)
    if (apiFetchMs > 0) debug.apiMs = String(apiFetchMs)

    if (items.length === 0) return finish(null)

    // --- Tier 3a: HIGH confidence → skip similarity, take first valid result ---
    if (intent.confidence === "HIGH") {
      for (const item of items.slice(0, 5)) {
        if (!item.url) continue
        const extracted = extractVideoId(item.url)
        if (!extracted) continue
        debug.tier = "3a"
        return finish(toRenderData(item, extracted.id, this.instanceUrl))
      }
      return finish(null)
    }

    // --- Tier 3b: MEDIUM / LOW confidence → run similarity gate ---
    debug.tier = "3b"
    for (const item of items.slice(0, 5)) {
      if (!item.title || !item.url) continue

      const sourceStr = item.uploader ? `${item.uploader} / TypeType` : ""
      const matches =
        queryMatchesChannel(trimmed, sourceStr) ||
        matchesQuery(trimmed, item.title)

      if (!matches) continue

      const extracted = extractVideoId(item.url)
      if (!extracted) continue

      debug.simMatch = "yes"
      return finish(toRenderData(item, extracted.id, this.instanceUrl))
    }

    debug.simMatch = "no"
    return finish(null)
  },
}
