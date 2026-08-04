function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`)
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

    if (hostMatches(host, "youtube.com")) {
      const vParam = parsed.searchParams.get("v")
      if (vParam && YOUTUBE_ID_RE.test(vParam)) return vParam
      const segments = parsed.pathname.split("/").filter(Boolean)
      const nested = segments[0] === "shorts" || segments[0] === "embed" || segments[0] === "live"
      const candidate = nested ? segments[1] : segments[0]
      return candidate && YOUTUBE_ID_RE.test(candidate) ? candidate : null
    }

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

function extractTypeTypeId(url: string): string | null {
  if (!url) return null
  try {
    // dummy base so relative/bare urls parse, no hostname check
    const parsed = url.includes("://") ? new URL(url) : new URL(url, "https://_")

    const vParam = parsed.searchParams.get("v")
    if (vParam) return vParam

    const segments = parsed.pathname.split("/").filter(Boolean)
    if (segments[0] === "embed" && segments[1]) return segments[1]

    return null
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

  const ttId = extractTypeTypeId(url)
  if (ttId) return { id: ttId, service: "typetype" }

  return null
}

function isBareVideoId(query: string): boolean {
  return /^[A-Za-z0-9_-]{11}$/.test(query)   // YouTube
    || /^BV[A-Za-z0-9]{10}$/i.test(query)     // Bilibili
    || /^sm\d+$/i.test(query)                   // Niconico
}

function normalizeText(value: string): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

const NON_VIDEO_QUERY = /\b(weather|forecast|stocks?|calculator|define|definition|translate|time\s+(in|at)|near\s+me|books?|isbn|doi)\b/i

const VIDEO_INTENT_RE = /\b(watch|play|video|music\s*video|official\s*video|official\s*audio|trailer|lyrics?|full\s*movie|full\s*album|live|remix|cover|hd|4k|clip|teaser|extended|uncut|directors?\s*cut|song|album|track|ep|single|mixtape|discography)\b/i

// video category terms, not specific content
const GENERIC_TERMS = new Set([
  "asmr", "clip", "compilation", "edit", "episode", "film", "game", "games",
  "guide", "live", "mix", "movie", "movies", "music", "playlist", "podcast",
  "reaction", "review", "reviews", "series", "show", "song", "songs", "stream",
  "trailer", "tutorial", "tutorials", "unboxing", "video", "videos", "vlog",
])

function matchesQuery(query: string, title: string): boolean {
  const q = normalizeText(query)
  const t = normalizeText(title)
  if (!q || !t) return false

  if (q === t) return true

  const queryWords = q.split(/\s+/).filter(Boolean)
  if (queryWords.length === 0) return false

  if (queryWords.length === 1) {
    // single words are too ambiguous for title matching
    return false
  }

  // multi-word: substring first, then word overlap
  if (t.includes(q) || q.includes(t)) return true

  const titleWords = new Set(t.split(/\s+/).filter(Boolean))
  return queryWords.every(w => titleWords.has(w))
}

function queryMatchesChannel(query: string, source: string): boolean {
  const uploader = (source ?? "").replace(/\s*\/\s*TypeType$/, "").trim()
  if (!uploader) return false
  const q = normalizeText(query)
  const ch = normalizeText(uploader)
  // single-word: exact match; multi-word: channel as one word
  const queryWords = q.split(/\s+/).filter(Boolean)
  if (queryWords.length === 1) return ch === q || ch.includes(q)
  return ch === q || q.includes(ch)
}

export {
  hostMatches,
  extractYouTubeId,
  extractBilibiliId,
  extractNiconicoId,
  extractTypeTypeId,
  extractVideoId,
  normalizeText,
  matchesQuery,
  queryMatchesChannel,
  NON_VIDEO_QUERY,
  VIDEO_INTENT_RE,
  isBareVideoId,
}

export const slot = {
  id: "typetype-player-slot",
  name: "TypeType Inline Player",
  description: "Embed a TypeType video player inline with search results.",
  position: "above-results",
  waitForResults: true,
  gridSize: 3,
  isClientExposed: false,

  instanceUrl: "",
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
  ],

  configure(settings: Record<string, any>) {
    if (typeof settings.instanceUrl === "string")
      this.instanceUrl = settings.instanceUrl.trim().replace(/\/+$/, "");
  },

  init(ctx: any) {
    this._template = ctx?.template ?? "";
  },

  async trigger(query: string): Promise<boolean> {
    const trimmed = query.trim();
    if (!trimmed) return false;
    if (trimmed.includes("://")) return true;
    if (isBareVideoId(trimmed)) return true;
    return true; // defer to execute
  },

  async execute(query: string, context: any): Promise<{ title?: string; html: string }> {
    if (!this.instanceUrl) return { html: "" };

    const render = (data: Record<string, string>): string => {
      let html = this._template || '<div class="typetype-player">{{title}}</div>';
      for (const [key, value] of Object.entries(data)) {
        html = html.replace(new RegExp(`\{\{\s*${key}\s*\}\}`, "g"), value ?? "");
        html = html.replace(
          new RegExp(`\{\{\s*#${key}\s*\}\\}([\\s\\S]*?)\\{\{\\s*/${key}\s*\}\\}`, "g"),
          value ? "$1" : ""
        );
      }
      return html.replace(/\{\{\s*[#/]?\w+\s*\}\}/g, "");
    };

    const trimmed = query.trim();
    if (!trimmed) return { html: "" };

    const embedUrl = (id: string) => `${this.instanceUrl}/embed/${id}?autoplay=1`;
    const watchUrl = (id: string) => `${this.instanceUrl}/watch?v=${id}`;

    if (trimmed.includes("://")) {
      const extracted = extractVideoId(trimmed);
      if (!extracted) return { html: "" };
      return { html: render({ id: extracted.id, embedUrl: embedUrl(extracted.id), watchUrl: watchUrl(extracted.id) }) };
    }

    if (isBareVideoId(trimmed)) {
      return { html: render({ id: trimmed, embedUrl: embedUrl(trimmed), watchUrl: watchUrl(trimmed) }) };
    }

    const bareId = extractTypeTypeId(trimmed);
    if (bareId) {
      return { html: render({ id: bareId, embedUrl: embedUrl(bareId), watchUrl: watchUrl(bareId) }) };
    }

    if (NON_VIDEO_QUERY.test(trimmed)) return { html: "" };

    const typeTypeResults: Array<{ url: string; title?: string; source?: string; thumbnail?: string; duration?: string }> =
      context?.results?.filter(
        (r: any) => typeof r.source === "string" && r.source.endsWith("/ TypeType"),
      ) ?? [];

    if (typeTypeResults.length === 0) return { html: "" };

    const hasVideoIntent = VIDEO_INTENT_RE.test(trimmed);

    for (const result of typeTypeResults.slice(0, 5)) {
      if (!result.title || !result.url) continue;

      const matches =
        hasVideoIntent ||
        queryMatchesChannel(trimmed, result.source ?? "") ||
        matchesQuery(trimmed, result.title);

      if (!matches) continue;

      const extracted = extractVideoId(result.url);
      if (!extracted) continue;

      const uploader = (result.source ?? "").replace(/\s*\/\s*TypeType$/, "").trim();
      const meta = [
        uploader || null,
        result.duration || null,
      ].filter(Boolean).join(" · ");

      return {
        title: "",
        html: render({
          id: extracted.id,
          title: result.title,
          embedUrl: embedUrl(extracted.id),
          watchUrl: watchUrl(extracted.id),
          thumbnail: result.thumbnail ?? "",
          uploader,
          meta,
        }),
      };
    }

    return { html: "" };
  },
};
