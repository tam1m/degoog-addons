# TypeType Inline Player

A degoog slot plugin that embeds an inline TypeType video player above search results when the user is confidently looking for a specific video.

## Triggers

The player activates when:

| Trigger | Example |
|---------|---------|
| `!typetype` bang | `!typetype never gonna give you up` |
| YouTube/Bilibili/Niconico URL pasted | `https://www.youtube.com/watch?v=...` |
| TypeType instance URL pasted | `https://watch.example.com/watch?v=...` |
| Bare video ID typed | `dQw4w9WgXcQ`, `BV...`, `sm...` |
| Search result with matching title | Query "despacito" + top result titled "Despacito" |

The player stays hidden for vague queries ("funny cats", "music") where no single video is clearly the right answer.
