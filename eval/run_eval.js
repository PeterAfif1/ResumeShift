#!/usr/bin/env node
/**
 * ResumeShift eval runner
 *
 * Usage:
 *   EVAL_MODE=1 node server/src/index.js   # start server with eval endpoint enabled
 *   node eval/run_eval.js                  # run this script in a second terminal
 *
 * Requires Node 18+ (native fetch). No extra dependencies.
 * Assumes server is running on http://localhost:3001.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SERVER = 'http://localhost:3001';
const CASES  = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'test_cases.json'), 'utf8'),
);

// ─── HTTP helpers ────────────────────────────────────────────────────────────

/**
 * Create a session directly from plain text via the eval-only endpoint.
 * The server must be started with EVAL_MODE=1.
 */
async function createSession(resumeText) {
  const res = await fetch(`${SERVER}/api/eval/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumeText }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Session create failed: ${data.error}`);
  return data.sessionId;
}

async function chat(sessionId, message) {
  const res = await fetch(`${SERVER}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Chat failed: ${data.error}`);
  return data; // { turns[], warning? }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractPhase(turns, phase) {
  for (const turn of (turns || [])) {
    if (turn.phase === phase && turn.parsed) return turn.parsed;
  }
  return null;
}

/**
 * Check how many of the expected missing_keywords appear (case-insensitive)
 * in either the rewritten bullet text or the keywords_added array.
 */
function findKeywordHits(missingKeywords, rewrites) {
  const haystack = rewrites
    .flatMap((r) => [r.rewritten || '', ...(r.keywords_added || [])])
    .join(' ')
    .toLowerCase();

  return missingKeywords.filter((kw) => haystack.includes(kw.toLowerCase()));
}

// ─── Per-case runner ─────────────────────────────────────────────────────────

async function runCase(tc) {
  const tag = `[${String(tc.id).padStart(2, '0')}]`;

  // Build a minimal single-bullet resume as plain text
  const resumeText = [
    'RESUME',
    '',
    'Experience',
    `• ${tc.resume_bullet}`,
  ].join('\n');

  // 1. Create session
  let sessionId;
  try {
    sessionId = await createSession(resumeText);
  } catch (err) {
    console.log(`${tag} ERROR creating session: ${err.message}`);
    return { pass: false, hits: [] };
  }

  // 2. Send goals — triggers Phase 1 → classifier → Phase 2 → Phase 3
  const goalMessage =
    `I'm targeting a ${tc.target_role} role. ` +
    `I'm a ${tc.experience_level}. ` +
    `I am ${tc.timeline}.`;

  let allTurns = [];

  try {
    const r1 = await chat(sessionId, goalMessage);
    allTurns = [...allTurns, ...(r1.turns || [])];

    // If Phase 3 didn't arrive yet, the classifier may have needed more context.
    // Send the goals again as a follow-up.
    if (!extractPhase(allTurns, 3)) {
      const r2 = await chat(sessionId, goalMessage);
      allTurns = [...allTurns, ...(r2.turns || [])];
    }

    // Final fallback: explicit trigger
    if (!extractPhase(allTurns, 3)) {
      const r3 = await chat(
        sessionId,
        'Please run the full resume analysis (Phase 2) and bullet rewrites (Phase 3) now.',
      );
      allTurns = [...allTurns, ...(r3.turns || [])];
    }
  } catch (err) {
    console.log(`${tag} ERROR during chat: ${err.message}`);
    return { pass: false, hits: [] };
  }

  // 3. Extract Phase 3 rewrites
  const phase3 = extractPhase(allTurns, 3);
  if (!phase3 || !phase3.rewrites?.length) {
    console.log(`${tag} FAIL  — Phase 3 not returned`);
    console.log(`        Bullet : "${tc.resume_bullet}"`);
    console.log(`        Role   : ${tc.target_role}`);
    console.log();
    return { pass: false, hits: [] };
  }

  // 4. Score keyword coverage
  const hits   = findKeywordHits(tc.missing_keywords, phase3.rewrites);
  const missed = tc.missing_keywords.filter((k) => !hits.includes(k));
  const pass   = hits.length >= 2;

  console.log(`${tag} ${pass ? 'PASS' : 'FAIL'}  — ${hits.length}/${tc.missing_keywords.length} keywords hit`);
  console.log(`        Bullet : "${tc.resume_bullet}"`);
  console.log(`        Role   : ${tc.target_role}`);
  console.log(`        Found  : ${hits.length  ? hits.join(', ')   : '(none)'}`);
  console.log(`        Missed : ${missed.length ? missed.join(', ') : '(none)'}`);
  console.log();

  return { pass, hits };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Verify the eval endpoint is reachable before burning API calls
  try {
    const probe = await fetch(`${SERVER}/api/health`);
    if (!probe.ok) throw new Error('health check failed');
  } catch {
    console.error(
      `Cannot reach ${SERVER}/api/health.\n` +
      'Start the server with:  EVAL_MODE=1 node server/src/index.js\n',
    );
    process.exit(1);
  }

  // Verify eval endpoint is enabled
  try {
    const probe = await fetch(`${SERVER}/api/eval/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeText: 'test' }),
    });
    if (probe.status === 403) {
      console.error(
        'Eval endpoint is disabled.\n' +
        'Start the server with:  EVAL_MODE=1 node server/src/index.js\n',
      );
      process.exit(1);
    }
  } catch (err) {
    console.error('Eval endpoint check failed:', err.message);
    process.exit(1);
  }

  console.log('ResumeShift Eval — Phase 3 Keyword Coverage');
  console.log('============================================');
  console.log(`Running ${CASES.length} test cases against ${SERVER}`);
  console.log('(Sequential — each case makes 3-4 OpenAI calls)\n');

  let passed       = 0;
  let totalHits    = 0;
  let totalKeywords = 0;

  for (const tc of CASES) {
    // Run sequentially to avoid rate-limit issues
    const result = await runCase(tc);
    if (result.pass) passed++;
    totalHits     += result.hits.length;
    totalKeywords += tc.missing_keywords.length;
  }

  const hitRate = (totalHits / totalKeywords).toFixed(2);

  console.log('============================================');
  console.log(`Score            : ${passed}/${CASES.length} PASS`);
  console.log(`Keyword hit rate : ${totalHits}/${totalKeywords} = ${hitRate}`);
  console.log('============================================');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
