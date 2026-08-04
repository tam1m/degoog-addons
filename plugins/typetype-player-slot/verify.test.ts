/**
 * Verification tests for the typetype-player-slot plugin.
 * Focuses on titleSimilarity and the similarity gate in execute().
 * Run with: npx tsx plugins/typetype-player-slot/verify.test.ts
 */

import { slot, titleSimilarity, hostMatches, extractYouTubeId, extractBilibiliId, extractNiconicoId, extractTypeTypeId, extractVideoId, formatDuration } from './index.ts'

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

// ============================================================
// titleSimilarity tests
// ============================================================

// --- Exact match (case-insensitive) → 1.0 ---
{
  console.log('\nTest: exact case-insensitive match -> 1.0')
  assertEqual(titleSimilarity('hello world', 'Hello World'), 1.0, 'exact match (different case)')
  assertEqual(titleSimilarity('HELLO', 'hello'), 1.0, 'exact match (all upper vs lower)')
  assertEqual(titleSimilarity('test', 'test'), 1.0, 'exact match (same case)')
}

// --- Query is substring of title → 0.7 ---
{
  console.log('\nTest: query is substring of title -> 0.7')
  assertEqual(titleSimilarity('cat', 'category'), 0.7, 'query is prefix of title')
  assertEqual(titleSimilarity('dog', 'hotdog stand'), 0.7, 'query is substring of title')
  assertEqual(titleSimilarity('HELLO', 'hello world'), 0.7, 'case-insensitive substring')
}

// --- Title is substring of query → 0.7 ---
{
  console.log('\nTest: title is substring of query -> 0.7')
  assertEqual(titleSimilarity('how to bake a cake fast', 'bake a cake'), 0.7, 'title is substring of query')
  assertEqual(titleSimilarity('WHAT IS AI', 'ai'), 0.7, 'case-insensitive, title is substring')
}

// --- Alphanumeric-only match → 0.5 ---
{
  console.log('\nTest: alphanumeric-only match -> 0.5')
  // "hello world!" has "hello world" as substring, so it gets 0.7 (substring wins over alphanumeric)
  assertEqual(titleSimilarity('hello world!', 'hello world'), 0.7, 'punctuation but substring still matches at 0.7')
  assertEqual(titleSimilarity('C++ Programming', 'C Programming'), 0.5, 'special chars stripped, different')
  assertEqual(titleSimilarity('node.js tutorial', 'node js tutorial'), 0.5, 'dots stripped match')
  assertEqual(titleSimilarity('100%  success', '100  success'), 0.5, 'percent stripped match')
  // True alphanumeric-only match: same chars but different spacing/punctuation so substring fails
  assertEqual(titleSimilarity('hello-world', 'hello world'), 0.5, 'dash vs space: alphanumeric match at 0.5')
}

// --- No match → 0.0 ---
{
  console.log('\nTest: no match -> 0.0')
  assertEqual(titleSimilarity('cats', 'dogs'), 0.0, 'completely different')
  assertEqual(titleSimilarity('hello', 'world'), 0.0, 'no overlap')
  assertEqual(titleSimilarity('', ''), 0.0, 'both empty')
  assertEqual(titleSimilarity('hello', ''), 0.0, 'title empty')
  assertEqual(titleSimilarity('', 'hello'), 0.0, 'query empty')
}

// --- Edge cases ---
{
  console.log('\nTest: edge cases')
  // When exact match exists, should return 1.0 not 0.7
  assertEqual(titleSimilarity('test', 'test'), 1.0, 'exact match wins over substring')
  // When substring match exists, should return 0.7 not 0.5
  assertEqual(titleSimilarity('hello world', 'hello'), 0.7, 'substring match wins over alphanumeric')
  // Whitespace differences should be handled
  assertEqual(titleSimilarity('  hello world  ', 'hello world'), 1.0, 'trimmed whitespace exact match')
  // Extra internal spaces break substring, fall to alphanumeric -> 0.5
  assertEqual(titleSimilarity('hello   world', 'hello world'), 0.5, 'extra spaces: not substring, alphanumeric match')
}

// ============================================================
// execute() similarity gate tests
// ============================================================

// --- Search-results path: matching title passes ---
{
  console.log('\nTest: execute() with matching title passes similarity gate')
  const testSlot = { ...slot }
  testSlot.configure({ instanceUrl: 'https://watch.example.com' })

  const context = {
    results: [
      { source: 'somewhere / TypeType', url: '/watch?v=test123', title: 'My Search Query Video' },
    ],
  }

  testSlot.execute('my search query', context).then((result: any) => {
    assert(result.html !== '', 'returns HTML when title matches query')
    assert(result.html.includes('test123'), 'HTML contains the video id')
  })
}

// --- Search-results path: mismatched title fails similarity gate ---
{
  console.log('\nTest: execute() with mismatched title fails similarity gate')
  const testSlot = { ...slot }
  testSlot.configure({ instanceUrl: 'https://watch.example.com' })

  const context = {
    results: [
      { source: 'somewhere / TypeType', url: '/watch?v=test456', title: 'Completely Unrelated Video' },
    ],
  }

  testSlot.execute('my specific search', context).then((result: any) => {
    assertEqual(result.html, '', 'returns empty HTML when title does not match query')
  })
}

// --- URL path: similarity check is skipped ---
{
  console.log('\nTest: execute() with URL skips similarity check')
  const testSlot = { ...slot }
  testSlot.configure({ instanceUrl: 'https://watch.example.com' })

  testSlot.execute('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {}).then((result: any) => {
    assert(result.html !== '', 'returns HTML for URL query (no similarity check)')
    assert(result.html.includes('dQw4w9WgXcQ'), 'HTML contains the YouTube video id')
  })
}

// --- Bare-ID path: similarity check is skipped ---
{
  console.log('\nTest: execute() with bare ID skips similarity check')
  const testSlot = { ...slot }
  testSlot.configure({ instanceUrl: 'https://watch.example.com' })

  testSlot.execute('/watch?v=abcdef12345', {}).then((result: any) => {
    assert(result.html !== '', 'returns HTML for bare ID query (no similarity check)')
    assert(result.html.includes('abcdef12345'), 'HTML contains the bare video id')
  })
}

// --- Similarity at exactly threshold 0.5 passes ---
{
  console.log('\nTest: similarity at exactly 0.5 threshold passes')
  const testSlot = { ...slot }
  testSlot.configure({ instanceUrl: 'https://watch.example.com' })

  const context = {
    results: [
      { source: 'somewhere / TypeType', url: '/watch?v=vid001', title: 'hello world' },
    ],
  }

  // "hello-world" vs "hello world": dash vs space breaks substring check,
  // but alphanumeric-only comparison matches -> exactly 0.5
  testSlot.execute('hello-world', context).then((result: any) => {
    assert(result.html !== '', 'returns HTML when similarity is exactly 0.5')
  })
}

// --- Similarity below 0.5 fails ---
{
  console.log('\nTest: similarity below 0.5 fails')
  const testSlot = { ...slot }
  testSlot.configure({ instanceUrl: 'https://watch.example.com' })

  const context = {
    results: [
      { source: 'somewhere / TypeType', url: '/watch?v=vid002', title: 'cats and dogs' },
    ],
  }

  // "birds" vs "cats and dogs" — completely different -> 0.0 < 0.5
  testSlot.execute('birds', context).then((result: any) => {
    assertEqual(result.html, '', 'returns empty HTML when similarity is 0.0 (below 0.5)')
  })
}

// --- No instance URL returns empty ---
{
  console.log('\nTest: execute() returns empty when no instanceUrl configured')
  const testSlot = { ...slot }
  // Don't configure — instanceUrl defaults to ""

  testSlot.execute('any query', {}).then((result: any) => {
    assertEqual(result.html, '', 'returns empty HTML when no instanceUrl')
  })
}

// ============================================================
// trigger() tests
// ============================================================

// --- Empty query returns false ---
{
  console.log('\nTest: trigger() returns false for empty query')
  slot.trigger('').then((result: boolean) => {
    assertEqual(result, false, 'empty string -> false')
  })
  slot.trigger('   ').then((result: boolean) => {
    assertEqual(result, false, 'whitespace only -> false')
  })
}

// --- !typetype bang returns true ---
{
  console.log('\nTest: trigger() returns true for !typetype bang')
  slot.trigger('!typetype').then((result: boolean) => {
    assertEqual(result, true, 'bare bang -> true')
  })
  slot.trigger('!typetype ').then((result: boolean) => {
    assertEqual(result, true, 'bang with trailing space -> true')
  })
  slot.trigger('!typetype never gonna give you up').then((result: boolean) => {
    assertEqual(result, true, 'bang with query -> true')
  })
}

// --- URL returns true ---
{
  console.log('\nTest: trigger() returns true for URLs')
  slot.trigger('https://www.youtube.com/watch?v=dQw4w9WgXcQ').then((result: boolean) => {
    assertEqual(result, true, 'https URL -> true')
  })
  slot.trigger('http://example.com').then((result: boolean) => {
    assertEqual(result, true, 'http URL -> true')
  })
}

// --- Bare video ID returns true ---
{
  console.log('\nTest: trigger() returns true for bare video IDs')
  slot.trigger('dQw4w9WgXcQ').then((result: boolean) => {
    assertEqual(result, true, '11-char YouTube ID -> true')
  })
  slot.trigger('BV1UbX3B2EZQ').then((result: boolean) => {
    assertEqual(result, true, 'Bilibili ID -> true')
  })
  slot.trigger('sm46525483').then((result: boolean) => {
    assertEqual(result, true, 'Niconico ID -> true')
  })
}

// --- Random query returns true (defer to execute) ---
{
  console.log('\nTest: trigger() returns true for random queries (defer to execute)')
  slot.trigger('never gonna give you up').then((result: boolean) => {
    assertEqual(result, true, 'random query -> true (defer)')
  })
}

// ============================================================
// execute() bang-stripping tests
// ============================================================

// --- Bang with nothing after returns empty ---
{
  console.log('\nTest: execute() with !typetype and nothing after returns empty')
  const testSlot = { ...slot }
  testSlot.configure({ instanceUrl: 'https://watch.example.com' })
  testSlot.execute('!typetype', {}).then((result: any) => {
    assertEqual(result.html, '', 'bare bang -> empty html')
  })
  testSlot.execute('!typetype ', {}).then((result: any) => {
    assertEqual(result.html, '', 'bang with only trailing space -> empty html')
  })
}

// --- Bang-stripping before title comparison ---
{
  console.log('\nTest: execute() strips !typetype bang before title comparison')
  const testSlot = { ...slot }
  testSlot.configure({ instanceUrl: 'https://watch.example.com' })

  const context = {
    results: [
      { source: 'somewhere / TypeType', url: '/watch?v=testBang', title: 'Never Gonna Give You Up' },
    ],
  }

  testSlot.execute('!typetype never gonna give you up', context).then((result: any) => {
    assert(result.html !== '', 'bang stripped, title matches -> HTML returned')
    assert(result.html.includes('testBang'), 'HTML contains the video id')
  })
}

// --- Bang with URL ---
{
  console.log('\nTest: execute() handles !typetype with URL')
  const testSlot = { ...slot }
  testSlot.configure({ instanceUrl: 'https://watch.example.com' })
  testSlot.execute('!typetype https://www.youtube.com/watch?v=dQw4w9WgXcQ', {}).then((result: any) => {
    assert(result.html !== '', 'bang + URL -> HTML returned')
    assert(result.html.includes('dQw4w9WgXcQ'), 'HTML contains the YouTube video id')
  })
}

// ============================================================
// execute() bare video ID tests
// ============================================================

// --- Bare YouTube ID ---
{
  console.log('\nTest: execute() with bare YouTube video ID')
  const testSlot = { ...slot }
  testSlot.configure({ instanceUrl: 'https://watch.example.com' })
  testSlot.execute('dQw4w9WgXcQ', {}).then((result: any) => {
    assert(result.html !== '', 'bare YouTube ID -> HTML returned')
    assert(result.html.includes('dQw4w9WgXcQ'), 'HTML contains the YouTube ID')
  })
}

// --- Bare Bilibili ID ---
{
  console.log('\nTest: execute() with bare Bilibili video ID')
  const testSlot = { ...slot }
  testSlot.configure({ instanceUrl: 'https://watch.example.com' })
  testSlot.execute('BV1UbX3B2EZQ', {}).then((result: any) => {
    assert(result.html !== '', 'bare Bilibili ID -> HTML returned')
    assert(result.html.includes('BV1UbX3B2EZQ'), 'HTML contains the Bilibili ID')
  })
}

// --- Bare Niconico ID ---
{
  console.log('\nTest: execute() with bare Niconico video ID')
  const testSlot = { ...slot }
  testSlot.configure({ instanceUrl: 'https://watch.example.com' })
  testSlot.execute('sm46525483', {}).then((result: any) => {
    assert(result.html !== '', 'bare Niconico ID -> HTML returned')
    assert(result.html.includes('sm46525483'), 'HTML contains the Niconico ID')
  })
}

// --- Bare ID with bang ---
{
  console.log('\nTest: execute() with !typetype and bare video ID')
  const testSlot = { ...slot }
  testSlot.configure({ instanceUrl: 'https://watch.example.com' })
  testSlot.execute('!typetype dQw4w9WgXcQ', {}).then((result: any) => {
    assert(result.html !== '', 'bang + bare ID -> HTML returned')
    assert(result.html.includes('dQw4w9WgXcQ'), 'HTML contains the video ID')
  })
}

// ============================================================
// execute() edge case: malformed URL, unknown domain
// ============================================================

// --- Malformed URL ---
{
  console.log('\nTest: execute() returns empty for malformed URL')
  const testSlot = { ...slot }
  testSlot.configure({ instanceUrl: 'https://watch.example.com' })
  testSlot.execute('https://example.com/something', {}).then((result: any) => {
    assertEqual(result.html, '', 'URL with no extractable ID -> empty html')
  })
}

// --- No throw from any execute path ---
{
  console.log('\nTest: execute() never throws')
  const testSlot = { ...slot }
  testSlot.configure({ instanceUrl: 'https://watch.example.com' })

  const queries = [
    '', '   ', '!typetype', '!typetype ',
    'https://example.com', 'https://example.com/weird/path',
    'not a match', 'dQw4w9WgXcQ', 'BV1UbX3B2EZQ', 'sm46525483',
  ]

  Promise.all(queries.map(q =>
    testSlot.execute(q, {}).then((result: any) => {
      // Should have html property, never throw
      assert(typeof result.html === 'string', `execute("${q}") returned html string`)
    })
  ))
}

// --- Wrap up ---
	setTimeout(() => {
	  console.log(`\n${passed} passed, ${failed} failed`)
	  if (failed > 0) process.exit(1)
	}, 2000)
