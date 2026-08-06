/**
 * Verification tests for typetype-beta-slot-beta.
 * Tests the NLP intent scoring, trigger() gating, and execute() three-tier behavior.
 * Run with: npx tsx plugins/typetype-beta-slot-beta/verify.test.ts
 */

// Re-import what we need — the slot is the main export, but we also test
// the internal NLP scorer by importing from the module. Since the scorer
// functions aren't individually exported, we test through the slot.
import { slot } from './index.ts'

const PASS = '\x1b[32mPASS\x1b[0m'
const FAIL = '\x1b[31mFAIL\x1b[0m'

let passed = 0
let failed = 0

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ${PASS} ${msg}`)
    passed++
  } else {
    console.log(`  ${FAIL} ${msg}`)
    failed++
    process.exitCode = 1
  }
}

function assertEqual(actual: any, expected: any, msg: string) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    console.log(`  ${PASS} ${msg}`)
    passed++
  } else {
    console.log(`  ${FAIL} ${msg}`)
    console.log(`       expected: ${e}`)
    console.log(`       actual:   ${a}`)
    failed++
    process.exitCode = 1
  }
}

function makeSlot(instanceUrl = 'https://watch.example.com') {
  const s = { ...slot }
  s.configure({ instanceUrl })
  s.init({ template: '<div class="typetype-beta" data-id="{{id}}">{{title}}{{#debugInfo}}<div class="typetype-beta-debug">{{debugInfo}}</div>{{/debugInfo}}</div>' })
  return s
}

/** Fake context.fetch that returns 200 for validation and empty results for search. */
function fakeCtx(overrides?: { results?: any[] }): any {
  return {
    fetch: async (_url: string, _opts?: any) => new Response("{}", { status: 200 }),
    results: overrides?.results ?? [],
  }
}

// ============================================================
// trigger() — Fast-path tests
// ============================================================

{
  console.log('\nTest: trigger() fast-paths')

  // Empty
  slot.trigger('').then((r: boolean) => assertEqual(r, false, 'empty string -> false'))
  slot.trigger('   ').then((r: boolean) => assertEqual(r, false, 'whitespace -> false'))

  // URL
  slot.trigger('https://www.youtube.com/watch?v=dQw4w9WgXcQ').then((r: boolean) => assert(r, 'YouTube URL -> true'))
  slot.trigger('http://example.com/video').then((r: boolean) => assert(r, 'generic URL -> true'))

  // Bare video IDs
  slot.trigger('dQw4w9WgXcQ').then((r: boolean) => assert(r, '11-char YouTube ID -> true'))
  slot.trigger('BV1UbX3B2EZQ').then((r: boolean) => assert(r, 'Bilibili BV ID -> true'))
  slot.trigger('sm46525483').then((r: boolean) => assert(r, 'Niconico sm ID -> true'))

  // Channel handles
  slot.trigger('@MrBeast').then((r: boolean) => assert(r, '@handle -> true'))
  slot.trigger('@mkbhd').then((r: boolean) => assert(r, '@mkbhd -> true'))

  // Platform prefixes
  slot.trigger('yt relaxing music').then((r: boolean) => assert(r, 'yt prefix -> true'))
  slot.trigger('v how to build a pc').then((r: boolean) => assert(r, 'v prefix -> true'))
  slot.trigger('nico vocaloid mix').then((r: boolean) => assert(r, 'nico prefix -> true'))
}

// ============================================================
// trigger() — Negative blocking tests
// ============================================================

{
  console.log('\nTest: trigger() blocks pure-negative queries')

  // Multiple negatives, no positives
  slot.trigger('buy cheap flights tickets').then((r: boolean) =>
    assertEqual(r, false, 'multi-negative -> false'))

  slot.trigger('pdf download ebook').then((r: boolean) =>
    assertEqual(r, false, 'pdf download ebook -> false'))

  slot.trigger('weather forecast map').then((r: boolean) =>
    assertEqual(r, false, 'weather forecast map -> false'))

  slot.trigger('npm api documentation').then((r: boolean) =>
    assertEqual(r, false, 'npm api docs -> false'))

  slot.trigger('zillow homes for sale').then((r: boolean) =>
    assertEqual(r, false, 'zillow homes -> false'))

  // Single negative, no positives
  slot.trigger('github').then((r: boolean) =>
    assertEqual(r, false, 'single negative token -> false'))
}

// ============================================================
// trigger() — Lets through ambiguous and positive queries
// ============================================================

{
  console.log('\nTest: trigger() lets through video and ambiguous queries')

  // Strong video signals
  slot.trigger('how to fix leaking faucet').then((r: boolean) =>
    assert(r, 'how to fix -> true (HIGH confidence)'))

  slot.trigger('gta 6 trailer').then((r: boolean) =>
    assert(r, 'trailer -> true'))

  slot.trigger('full movie interstellar').then((r: boolean) =>
    assert(r, 'full movie -> true'))

  slot.trigger('15 min morning yoga').then((r: boolean) =>
    assert(r, 'fitness routine -> true'))

  slot.trigger('mkbhd iphone review').then((r: boolean) =>
    assert(r, 'known entity -> true'))

  // Negative + strong positive: let through
  slot.trigger('pdf tutorial').then((r: boolean) =>
    assert(r, 'pdf tutorial -> true (positive cancels negative)'))

  slot.trigger('download tutorial').then((r: boolean) =>
    assert(r, 'download tutorial -> true'))

  // Ambiguous: let through (similarity gate will decide)
  slot.trigger('never gonna give you up').then((r: boolean) =>
    assert(r, 'song title -> true (defer to execute)'))

  slot.trigger('best laptop 2026').then((r: boolean) =>
    assert(r, 'ambiguous query -> true (defer to execute)'))

  slot.trigger('python decorators').then((r: boolean) =>
    assert(r, 'no signals -> true (defer to execute)'))
}

// ============================================================
// execute() — Tier 1: URL / bare ID → render immediately
// ============================================================

{
  console.log('\nTest: execute() Tier 1 — URL / bare ID immediate render')

  const s = makeSlot()

  s.execute('https://www.youtube.com/watch?v=dQw4w9WgXcQ', fakeCtx()).then((result: any) => {
    assert(result.html !== '', 'YouTube URL -> renders HTML')
    assert(result.html.includes('dQw4w9WgXcQ'), 'HTML contains video ID')
  })

  s.execute('dQw4w9WgXcQ', fakeCtx()).then((result: any) => {
    assert(result.html !== '', 'bare YT ID -> renders HTML')
    assert(result.html.includes('dQw4w9WgXcQ'), 'HTML contains video ID')
  })

  s.execute('BV1UbX3B2EZQ', fakeCtx()).then((result: any) => {
    assert(result.html !== '', 'bare BV ID -> renders HTML')
    assert(result.html.includes('BV1UbX3B2EZQ'), 'HTML contains video ID')
  })

  s.execute('sm46525483', fakeCtx()).then((result: any) => {
    assert(result.html !== '', 'bare sm ID -> renders HTML')
    assert(result.html.includes('sm46525483'), 'HTML contains video ID')
  })

  // TypeType bare ID
  s.execute('/watch?v=abcdef12345', fakeCtx()).then((result: any) => {
    assert(result.html !== '', '/watch?v= -> renders HTML')
    assert(result.html.includes('abcdef12345'), 'HTML contains video ID')
  })
}

// ============================================================
// execute() — Tier 2: HIGH confidence → skip similarity
// ============================================================

{
  console.log('\nTest: execute() Tier 2 — HIGH confidence skips similarity gate')

  const s = makeSlot()

  // HIGH confidence query with matching results
  const highCtx = {
    results: [
      { source: 'Uploader / TypeType', url: 'https://www.youtube.com/watch?v=vidHigh001', title: 'How to Fix a Leaking Faucet', thumbnail: '/thumb.jpg', duration: '5:23' },
    ],
  }

  s.execute('how to fix leaking faucet', highCtx).then((result: any) => {
    assert(result.html !== '', 'HIGH confidence -> renders HTML')
    assert(result.html.includes('vidHigh001'), 'HTML contains video ID (first result, no similarity check)')
  })

  // HIGH confidence even with mismatched title — still renders first result
  const highCtxMismatched = {
    results: [
      { source: 'Uploader / TypeType', url: 'https://www.youtube.com/watch?v=vidHigh002', title: 'Completely Unrelated Video', thumbnail: '/thumb.jpg', duration: '3:00' },
    ],
  }

  s.execute('how to fix leaking faucet', highCtxMismatched).then((result: any) => {
    assert(result.html !== '', 'HIGH confidence -> renders even with mismatched title')
  })
}

// ============================================================
// execute() — Tier 3: MEDIUM/LOW confidence → similarity gate
// ============================================================

{
  console.log('\nTest: execute() Tier 3 — similarity gate for MEDIUM/LOW confidence')

  const s = makeSlot()

  // Matching title passes similarity (query words are subset of title words)
  const matchCtx = {
    results: [
      { source: 'Uploader / TypeType', url: 'https://www.youtube.com/watch?v=vidSim001', title: 'Python Decorators Explained Simply' },
    ],
  }

  s.execute('python decorators explained', matchCtx).then((result: any) => {
    assert(result.html !== '', 'title match -> renders HTML')
    assert(result.html.includes('vidSim001'), 'HTML contains matched video ID')
  })

  // Mismatched title fails similarity
  const mismatchCtx = {
    results: [
      { source: 'Uploader / TypeType', url: 'https://www.youtube.com/watch?v=vidSim002', title: 'Cats Playing Piano' },
    ],
  }

  s.execute('python decorators explained', mismatchCtx).then((result: any) => {
    assertEqual(result.html, '', 'title mismatch -> empty HTML')
  })

  // Song title with matching result
  const songCtx = {
    results: [
      { source: 'RickAstleyVEVO / TypeType', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Rick Astley - Never Gonna Give You Up (Official Video)' },
    ],
  }

  s.execute('never gonna give you up', songCtx).then((result: any) => {
    assert(result.html !== '', 'song title with matching result -> renders HTML')
  })

  // Channel match
  const channelCtx = {
    results: [
      { source: 'MKBHD / TypeType', url: 'https://www.youtube.com/watch?v=vidChan001', title: 'iPhone 16 Review' },
    ],
  }

  s.execute('mkbhd', channelCtx).then((result: any) => {
    assert(result.html !== '', 'channel name match -> renders HTML')
  })
}

// ============================================================
// execute() — Edge cases
// ============================================================

{
  console.log('\nTest: execute() edge cases')

  const s = makeSlot()

  // No instanceUrl
  const noUrl = { ...slot }
  noUrl.execute('any query', fakeCtx()).then((result: any) => {
    assertEqual(result.html, '', 'no instanceUrl -> empty HTML')
  })

  // Empty query
  s.execute('', fakeCtx()).then((result: any) => {
    assertEqual(result.html, '', 'empty query -> empty HTML')
  })

  s.execute('   ', fakeCtx()).then((result: any) => {
    assertEqual(result.html, '', 'whitespace -> empty HTML')
  })

  // Non-video query with no results
  s.execute('buy cheap flights', fakeCtx()).then((result: any) => {
    assertEqual(result.html, '', 'negative query no results -> empty HTML')
  })

  // No TypeType results
  const noResultsCtx = fakeCtx({ results: [{ source: 'Google', title: 'Whatever', url: '/something' }] })
  s.execute('how to fix leaking faucet', noResultsCtx).then((result: any) => {
    assertEqual(result.html, '', 'no TypeType results -> empty HTML')
  })

  // Malformed URL
  s.execute('https://example.com/something', fakeCtx()).then((result: any) => {
    assertEqual(result.html, '', 'non-video URL -> empty HTML')
  })
}

// ============================================================
// execute() — Debug output
// ============================================================

{
  console.log('\nTest: execute() debug output')

  const s = makeSlot()
  s.configure({ instanceUrl: 'https://watch.example.com', debug: true })

  // Debug on: should contain stats footer
  s.execute('dQw4w9WgXcQ', fakeCtx()).then((result: any) => {
    assert(result.html.includes('typetype-beta-debug'), 'debug on -> HTML contains debug footer')
    assert(result.html.includes('tier 2'), 'debug shows tier (bare ID is now tier 2)')
    assert(/\d+ms/.test(result.html), 'debug shows timing in ms')

    // Print a sample so you can see the output
    const debugLine = result.html.match(/<div class="typetype-beta-debug"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '(not found)'
    console.log(`\n  Sample debug footer:\n  ${debugLine}`)
  })

  // Debug off: no stats footer
  const s2 = makeSlot()
  s2.configure({ instanceUrl: 'https://watch.example.com', debug: false })
  s2.execute('dQw4w9WgXcQ', fakeCtx()).then((result: any) => {
    assert(!result.html.includes('typetype-beta-debug'), 'debug off -> no debug footer')
  })

  // Debug off by default (makeSlot doesn't set debug)
  const s3 = makeSlot()
  s3.execute('dQw4w9WgXcQ', fakeCtx()).then((result: any) => {
    assert(!result.html.includes('typetype-beta-debug'), 'default debug -> no debug footer')
  })
}

// ============================================================
// execute() — never throws
// ============================================================

{
  console.log('\nTest: execute() never throws')

  const s = makeSlot()

  const queries = [
    '', '   ',
    'https://example.com',
    'dQw4w9WgXcQ',
    'not a match',
    'buy cheap flights tickets',
    'how to fix leaking faucet',
  ]

  Promise.all(queries.map(q =>
    s.execute(q, fakeCtx({ results: [] })).then((result: any) => {
      assert(typeof result.html === 'string', `execute("${q}") returns html string`)
    })
  ))
}

// ============================================================
// trigger() — score boundary tests
// ============================================================

{
  console.log('\nTest: trigger() score boundaries')

  // Negative + weak positive crosses -0.50 threshold
  slot.trigger('download guide').then((r: boolean) => {
    // download (-0.80) + guide (+0.30) = -0.50, which is NOT < -0.50
    assertEqual(r, true, 'download guide -> true (at boundary -0.50)')
  })

  // Two negatives with no positives
  slot.trigger('buy pdf').then((r: boolean) => {
    assertEqual(r, false, 'buy pdf -> false (two negatives)')
  })

  // One negative + format trigger
  slot.trigger('download tutorial').then((r: boolean) => {
    // download (-0.80) + tutorial (+0.80) = 0.00
    assert(r, 'download tutorial -> true (format cancels negative)')
  })
}

// ============================================================
// Report
// ============================================================

setTimeout(() => {
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}, 2000)
