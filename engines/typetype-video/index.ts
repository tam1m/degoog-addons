export const type = ["web", "videos"]

// Instance URL is user-configured, so outbound hosts are unrestricted
export const outgoingHosts = ["*"]

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`)
}

// maps upstream domains to their service ID for degoog's site: operator
const SITE_TO_SERVICE: Record<string, number> = {
  "youtube.com": 0,
  "youtu.be": 0,
  "m.youtube.com": 0,
  "www.youtube.com": 0,
  "bilibili.com": 5,
  "www.bilibili.com": 5,
  "nicovideo.jp": 6,
  "www.nicovideo.jp": 6,
}

function resolveSiteOperator(
  query: string,
  instanceUrl: string,
): { query: string; restrictToService?: number } | null {
  const siteRe = /site:(\S+)/gi

  let instanceHost: string
  try {
    instanceHost = new URL(instanceUrl).hostname.toLowerCase()
  } catch {
    return { query } // can't parse instance url, search normally
  }

  let restrictToService: number | undefined
  let match: RegExpExecArray | null
  while ((match = siteRe.exec(query)) !== null) {
    const siteDomain = match[1].toLowerCase()

    if (siteDomain === instanceHost) continue // ours, strip it

    const service = SITE_TO_SERVICE[siteDomain]
    if (service !== undefined) {
      restrictToService = service // last one wins
      continue
    }

    return null // nope
  }

  const cleaned = query.replace(/\s*site:\S+\s*/gi, " ").trim()
  if (!cleaned) return null // nothing left after stripping

  return { query: cleaned, restrictToService }
}

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/

function extractYouTubeId(url: string): string | null {
  if (!url) return null

  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()

    if (host === "youtu.be") {
      const segments = parsed.pathname.split("/").filter(Boolean)
      const candidate = segments[0]
      return candidate && YOUTUBE_ID_RE.test(candidate) ? candidate : null
    }

    // prefer v= over path segments
    if (hostMatches(host, "youtube.com")) {
      const vParam = parsed.searchParams.get("v")
      if (vParam && YOUTUBE_ID_RE.test(vParam)) return vParam
      const segments = parsed.pathname.split("/").filter(Boolean)
      const nested = segments[0] === "shorts" || segments[0] === "embed" || segments[0] === "live"
      const candidate = nested ? segments[1] : segments[0]
      return candidate && YOUTUBE_ID_RE.test(candidate) ? candidate : null
    }

    // not a youtube hostname, don't guess
    return null
  } catch {
    return null
  }
}

function extractBilibiliId(url: string): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (!hostMatches(parsed.hostname.toLowerCase(), "bilibili.com")) return null
    const segments = parsed.pathname.split("/").filter(Boolean)
    const candidate = segments[0] === "video" ? segments[1] : null
    return candidate && /^BV[A-Za-z0-9]{10}$/i.test(candidate) ? candidate : null
  } catch {
    return null
  }
}

function extractNiconicoId(url: string): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (!hostMatches(parsed.hostname.toLowerCase(), "nicovideo.jp")) return null
    const segments = parsed.pathname.split("/").filter(Boolean)
    const candidate = segments[0] === "watch" ? segments[1] : null
    return candidate && /^sm\d+$/i.test(candidate) ? candidate : null
  } catch {
    return null
  }
}

function extractVideoId(url: string): { id: string; service: string } | null {
  // Bilibili/Niconico before YouTube, otherwise 11-char pattern catches substrings
  const biliId = extractBilibiliId(url)
  if (biliId) return { id: biliId, service: "bilibili" }

  const nicoId = extractNiconicoId(url)
  if (nicoId) return { id: nicoId, service: "niconico" }

  const ytId = extractYouTubeId(url)
  if (ytId) return { id: ytId, service: "youtube" }

  return null
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

function formatViewCount(count: number): string {
  if (!count || count <= 0 || Number.isNaN(count)) return ""
  if (count >= 1_000_000_000)
    return `${(count / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`
  if (count >= 1_000_000)
    return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  if (count >= 1_000)
    return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K`
  return String(count)
}

interface VideoItem {
  id: string
  title: string
  url: string
  thumbnailUrl: string
  uploaderName: string
  uploaderUrl: string
  uploaderAvatarUrl: string
  duration: number
  viewCount: number
  uploadDate: string
  shortDescription: string
  streamType: string
  isLive: boolean
}

interface TypeTypeSearchResponse {
  items: VideoItem[]
  channels: any[]
  playlists: any[]
  nextpage: string | null
}

interface SearchResult {
  title: string
  url: string
  snippet: string
  source: string
  thumbnail?: string
  duration?: string
}

export default class TypeTypeVideoEngine {
  isClientExposed = false
  name = "TypeType"
  bangShortcut = "tt"

  settingsSchema = [
    {
      key: "instanceUrl",
      label: "Instance URL",
      type: "url",
      required: true,
      placeholder: "https://watch.example.com",
      description: "Your self-hosted TypeType server URL (without /api).",
    },
    {
      key: "watchRoute",
      label: "Result link type",
      type: "select",
      options: ["watch", "embed"],
      default: "watch",
      description:
        "Link results to the /watch page or /embed player.",
    },
    { key: "youtube", label: "YouTube", type: "toggle", default: true },
    { key: "bilibili", label: "Bilibili", type: "toggle", default: false },
    { key: "niconico", label: "Niconico", type: "toggle", default: false },
  ]

  instanceUrl = ""
  watchRoute = "watch"
  youtube = true
  bilibili = false
  niconico = false

  configure(settings: Record<string, any>) {
    if (typeof settings.instanceUrl === "string")
      this.instanceUrl = settings.instanceUrl.trim().replace(/\/+$/, "")
    if (typeof settings.watchRoute === "string")
      this.watchRoute = settings.watchRoute
    if (typeof settings.youtube === "boolean") this.youtube = settings.youtube
    if (typeof settings.bilibili === "boolean")
      this.bilibili = settings.bilibili
    if (typeof settings.niconico === "boolean")
      this.niconico = settings.niconico
  }

  private getEnabledServices(): number[] {
    const services: number[] = []
    if (this.youtube) services.push(0)
    if (this.bilibili) services.push(5)
    if (this.niconico) services.push(6)
    return services
  }

  async executeSearch(
    query: string,
    page = 1,
    _timeFilter: string,
    context: any
  ): Promise<SearchResult[]> {
    if (!this.instanceUrl) return []

    if (page >= 6) return []

    // resolve degoog's site: operator
    const resolved = resolveSiteOperator(query, this.instanceUrl)
    if (resolved === null) return []
    const searchQuery = resolved.query

    const doFetch = context?.fetch ?? fetch

    const services = resolved.restrictToService !== undefined
      ? [resolved.restrictToService]
      : this.getEnabledServices()

    if (services.length === 0) return []

    const mapItems = (items: VideoItem[]): SearchResult[] =>
      items.map((item: VideoItem): SearchResult => {
        const videoId = extractVideoId(item.url)
        let resultUrl: string
        if (videoId) {
          if (this.watchRoute === "embed") {
            resultUrl = `${this.instanceUrl}/embed/${videoId.id}`
          } else {
            resultUrl = `${this.instanceUrl}/watch?v=${videoId.id}`
          }
        } else {
          resultUrl = item.url
        }

        let snippet = item.shortDescription ?? ""
        if (!snippet) {
          const parts: string[] = []
          if (item.uploaderName) parts.push(item.uploaderName)
          if (item.viewCount)
            parts.push(`${formatViewCount(item.viewCount)} views`)
          if (item.uploadDate) parts.push(item.uploadDate)
          snippet = parts.join(" \u2022 ")
        }

        const source = item.uploaderName
          ? `${item.uploaderName} / TypeType`
          : "TypeType"

        const result: SearchResult = {
          title: item.title,
          url: resultUrl,
          snippet,
          source,
        }

        const thumbnail =
          context?.signProxyUrl?.(item.thumbnailUrl) ?? item.thumbnailUrl
        if (thumbnail) result.thumbnail = thumbnail

        if (item.isLive) {
          result.duration = "LIVE"
        } else {
          const duration = formatDuration(item.duration)
          if (duration) result.duration = duration
        }

        return result
      })

    const fetchPage = async (
      url: string,
      signal?: AbortSignal
    ): Promise<{ items: VideoItem[]; nextpage: string | null }> => {
      const response = await doFetch(url, { signal })

      context?.sentinel?.(response, this.name)

      const data: TypeTypeSearchResponse = await response.json()
      return { items: data?.items ?? [], nextpage: data.nextpage ?? null }
    }

    // cursor chain, each iteration advances one page, only the last page's items are kept
    const fetchService = async (serviceId: number): Promise<SearchResult[]> => {
      // wire parent abort signal so degoog can cancel in-flight requests
      const controller = new AbortController()
      const parentSignal = context?.signal
      const forwardAbort = () => controller.abort(parentSignal?.reason)

      if (parentSignal?.aborted) {
        forwardAbort()
      } else if (parentSignal) {
        parentSignal.addEventListener("abort", forwardAbort, { once: true })
      }

      try {
        let nextpage: string | null = null
        let items: VideoItem[] = []

        for (let i = 0; i < page; i++) {
          let url: string
          if (i === 0) {
            url = `${this.instanceUrl}/api/search?q=${encodeURIComponent(searchQuery)}&service=${serviceId}`
          } else {
            if (!nextpage) return []
            url = `${this.instanceUrl}/api/search?q=${encodeURIComponent(searchQuery)}&service=${serviceId}&nextpage=${encodeURIComponent(nextpage)}`
          }

          const result = await fetchPage(url, controller.signal)
          nextpage = result.nextpage
          items = result.items
        }

        return mapItems(items)
      } finally {
        if (parentSignal) {
          parentSignal.removeEventListener("abort", forwardAbort)
        }
      }
    }

    const results = await Promise.allSettled(services.map(fetchService))

    // merge, re-throw SentinelBreach, drop other failures
    const merged: SearchResult[] = []
    for (const result of results) {
      if (result.status === "fulfilled") {
        merged.push(...result.value)
      } else if (result.reason?.name === "SentinelBreach") {
        throw result.reason
      }
    }
    return merged
  }
}
