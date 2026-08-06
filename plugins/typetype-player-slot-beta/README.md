# TypeType Inline Player (Beta)

Beta slot plugin with NLP-based intent detection for smarter activation.

## What's Different from Prod

| Aspect | Prod (`typetype-player-slot`) | Beta (`typetype-player-slot-beta`) |
|--------|------------------------------|-------------------------------------|
| **trigger()** | Always `true` for non-empty | NLP heuristic blocks obvious non-video queries |
| **execute()** | Always runs similarity gate | Three-tier: instant render / skip similarity / similarity gate |
| **Negative detection** | Simple regex (`NON_VIDEO_QUERY`) | Rich token set with weighted scoring |
| **Confidence** | Binary (show/hide) | Three-tier: HIGH / MEDIUM / LOW |
| **Result source** | degoog engine only | Configurable: degoog / TypeType API / both |
| **Debug** | None | Toggleable stats footer with timing and path info |

## Architecture

```
trigger(query):
  ├── URL / bare ID / @handle?           → true  (instant)
  ├── Platform prefix (yt / nico / …)?   → true  (instant)
  ├── NLP score < -0.50?                 → false (negatives dominate)
  └── Otherwise                          → true  (defer to execute)

execute(query, context):
  ├── URL / bare ID?                     → render immediately
  ├── NLP score HIGH (≥ 0.80)?           → render first TypeType result
  └── MEDIUM / LOW                       → run similarity gate
```

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `instanceUrl` | url | — | TypeType server URL (required) |
| `resultSource` | select | `both` | `both` = prefer degoog, fall back to API. `degoog` = engine results only. `typetype` = direct API only |
| `debug` | toggle | `false` | Show scoring, timing, and path info below the player card |

## NLP Intent Scoring

The heuristic scorer analyzes the query text for video intent signals:

- **+1.00** — explicit triggers: `youtube`, `video`, `bilibili`, `nico`, `vlog`, `shorts`
- **+0.95** — media phrases: `full movie`, `music video`, `official audio`
- **+0.85** — known entities: `mkbhd`, `mrbeast`, `veritasium`, `hololive`
- **+0.85** — physical how-to: `how to fix`, `how to build`, `how to cook`
- **+0.80** — format triggers: `trailer`, `tutorial`, `review`, `gameplay`, `lyrics`
- **+0.75** — visual domains: `workout`, `yoga`, `makeup`, `ufc`, `nba`
- **+0.45** — visual verbs: `draw`, `cook`, `repair`, `install`, `dance`
- **+0.30** — weak modifiers: `guide`, `tour`, `vs`, `cover`, `diy`
- **-0.80 / each** — negative triggers: `pdf`, `buy`, `weather`, `wiki`, `github`, `flights`

## Debug Output

When `debug` is enabled, each rendered player card gets a footer line like:

```
score 0.92 (HIGH) · src degoog · tier 2 · 14ms · signals: phrase:how_to_physical, visual_verb:fix
```

Fields: NLP score + confidence, data source, rendering tier, total execute() time, top matched signals.

## Test

```bash
npx tsx plugins/typetype-player-slot-beta/verify.test.ts
```
