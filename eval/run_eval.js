#!/usr/bin/env node
/**
 * ResumeShift eval runner — v3
 *
 * PASS/FAIL logic:
 *   For each Phase 3 rewrite, find the corresponding Phase 2 flagged bullet
 *   and check if ≥2 of the model's own missing_keywords from Phase 2 appear
 *   in the rewritten text or keywords_added. The hardcoded missing_keywords
 *   in test_cases.json are printed as a reference only.
 *
 * Usage:
 *   EVAL_MODE=1 node server/src/index.js   # terminal 1
 *   node eval/run_eval.js                  # terminal 2
 *
 * Requires Node 18+ (native fetch). No extra dependencies.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SERVER = 'http://localhost:3001';
const CASES  = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'test_cases.json'), 'utf8'),
);

// ─── HTTP helpers ────────────────────────────────────────────────────────────

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

// ─── Turn helpers ─────────────────────────────────────────────────────────────

function extractPhase(turns, phase) {
  for (const turn of (turns || [])) {
    if (turn.phase === phase && turn.parsed) return turn.parsed;
  }
  return null;
}

// ─── Keyword scoring (v3) ────────────────────────────────────────────────────

/**
 * Build a lookup map from original bullet text → model's missing_keywords.
 * Uses the Phase 2 flagged_bullets array.
 *
 * @param {object} phase2 - parsed Phase 2 JSON
 * @returns {Map<string, string[]>} original bullet → missing_keywords[]
 */
function buildKeywordMap(phase2) {
  const map = new Map();
  for (const bullet of (phase2.flagged_bullets || [])) {
    if (bullet.original && Array.isArray(bullet.missing_keywords)) {
      map.set(bullet.original.trim(), bullet.missing_keywords);
    }
  }
  return map;
}

/**
 * For a single rewrite, find how many of the model's Phase 2 keywords
 * appear in the rewritten text or keywords_added (case-insensitive).
 *
 * @param {string[]} modelKeywords - from Phase 2 flagged bullet
 * @param {object}   rewrite       - Phase 3 rewrite object
 * @returns {string[]} keywords that were found
 */
function scoreRewrite(modelKeywords, rewrite) {
  const haystack = [
    rewrite.rewritten || '',
    ...(rewrite.keywords_added || []),
  ]
    .join(' ')
    .toLowerCase();

  return modelKeywords.filter((kw) => haystack.includes(kw.toLowerCase()));
}

/**
 * Score a full test case.
 *
 * Strategy: find the rewrite whose `original` best matches the test bullet,
 * then check the model's own Phase 2 keywords for that bullet.
 * Falls back to scoring across all rewrites if no exact match.
 *
 * @returns {{ pass: boolean, modelKeywords: string[], foundKeywords: string[] }}
 */
function scoreCase(tc, phase2, phase3) {
  const kwMap = buildKeywordMap(phase2);

  // Try to find the rewrite that corresponds to the test bullet
  // (exact match first, then substring match)
  const testBullet = tc.resume_bullet.trim().toLowerCase();

  let matchedRewrite = null;
  let modelKeywords  = [];

  for (const [original, kws] of kwMap.entries()) {
    if (original.toLowerCase() === testBullet) {
      // Exact match
      const rw = phase3.rewrites.find(
        (r) => r.original?.trim().toLowerCase() === original.toLowerCase(),
      );
      if (rw) { matchedRewrite = rw; modelKeywords = kws; break; }
    }
  }

  if (!matchedRewrite) {
    // Substring match — the model may have slightly rephrased the bullet
    for (const [original, kws] of kwMap.entries()) {
      const origLower = original.toLowerCase();
      const rw = phase3.rewrites.find(
        (r) => r.original?.trim().toLowerCase() === origLower,
      );
      if (rw && (origLower.includes(testBullet) || testBullet.includes(origLower))) {
        matchedRewrite = rw; modelKeywords = kws; break;
      }
    }
  }

  if (!matchedRewrite) {
    // No match found — fall back to scoring all rewrites against all model keywords
    // (handles cases where the model paraphrased the bullet significantly)
    modelKeywords = [...kwMap.values()].flat();
    const allHaystack = phase3.rewrites
      .flatMap((r) => [r.rewritten || '', ...(r.keywords_added || [])])
      .join(' ')
      .toLowerCase();
    const found = [...new Set(
      modelKeywords.filter((kw) => allHaystack.includes(kw.toLowerCase())),
    )];
    return { pass: found.length >= 2, modelKeywords, foundKeywords: found };
  }

  const found = scoreRewrite(modelKeywords, matchedRewrite);
  return {
    pass: found.length >= 2,
    modelKeywords,
    foundKeywords: found,
  };
}

// ─── Per-case runner ──────────────────────────────────────────────────────────

async function runCase(tc) {
  const tag = `[${String(tc.id).padStart(2, '0')}]`;

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
    console.log(`${tag} ERROR creating session: ${err.message}\n`);
    return { pass: false, modelKeywords: [], foundKeywords: [] };
  }

  // 2. Send goals — server runs Phase 1 classifier, then asks for JD (Phase 1.5)
  const goalMessage =
    `I'm targeting a ${tc.target_role} role. ` +
    `I'm a ${tc.experience_level}. ` +
    `I am ${tc.timeline}.`;

  // Phase 1.5 response: send the JD if present, otherwise skip
  const jdMessage = tc.job_description
    ? tc.job_description
    : 'skip';

  const jdPath = tc.job_description ? 'JD-grounded' : 'general (skip)';

  let allTurns = [];

  try {
    // Turn 1: goals → triggers Phase 1 classifier
    const r1 = await chat(sessionId, goalMessage);
    allTurns = [...allTurns, ...(r1.turns || [])];

    // Turn 2: JD or skip → triggers Phase 1.5 classifier → auto-chains Phase 2 → 3
    if (!extractPhase(allTurns, 3)) {
      const r2 = await chat(sessionId, jdMessage);
      allTurns = [...allTurns, ...(r2.turns || [])];
    }

    // If Phase 3 still hasn't arrived, the classifier may have needed more context.
    // Retry goals + JD/skip.
    if (!extractPhase(allTurns, 3)) {
      const r3 = await chat(sessionId, goalMessage);
      allTurns = [...allTurns, ...(r3.turns || [])];
    }

    if (!extractPhase(allTurns, 3)) {
      const r4 = await chat(sessionId, jdMessage);
      allTurns = [...allTurns, ...(r4.turns || [])];
    }

    // Final fallback: explicit trigger
    if (!extractPhase(allTurns, 3)) {
      const r5 = await chat(
        sessionId,
        'Please run the full resume analysis (Phase 2) and bullet rewrites (Phase 3) now.',
      );
      allTurns = [...allTurns, ...(r5.turns || [])];
    }
  } catch (err) {
    console.log(`${tag} ERROR during chat: ${err.message}\n`);
    return { pass: false, modelKeywords: [], foundKeywords: [] };
  }

  // 3. Extract phases
  const phase2 = extractPhase(allTurns, 2);
  const phase3 = extractPhase(allTurns, 3);

  if (!phase2) {
    console.log(`${tag} FAIL  — Phase 2 not returned`);
    console.log(`        Bullet : "${tc.resume_bullet}"\n`);
    return { pass: false, modelKeywords: [], foundKeywords: [] };
  }

  if (!phase3 || !phase3.rewrites?.length) {
    console.log(`${tag} FAIL  — Phase 3 not returned`);
    console.log(`        Bullet : "${tc.resume_bullet}"\n`);
    return { pass: false, modelKeywords: [], foundKeywords: [] };
  }

  // 4. Score using model's own Phase 2 keywords
  const { pass, modelKeywords, foundKeywords } = scoreCase(tc, phase2, phase3);
  const missed = modelKeywords.filter((k) => !foundKeywords.includes(k));

  console.log(`${tag} ${pass ? 'PASS' : 'FAIL'}  — ${foundKeywords.length}/${modelKeywords.length} model keywords followed through`);
  console.log(`        Bullet     : "${tc.resume_bullet}"`);
  console.log(`        Role       : ${tc.target_role}`);
  console.log(`        JD path    : ${jdPath}`);
  console.log(`        Model kws  : ${modelKeywords.length  ? modelKeywords.join(', ')  : '(none flagged)'}`);
  console.log(`        Found      : ${foundKeywords.length  ? foundKeywords.join(', ')  : '(none)'}`);
  console.log(`        Missed     : ${missed.length         ? missed.join(', ')         : '(none)'}`);
  console.log(`        Ref kws    : ${tc.missing_keywords.join(', ')}  [reference only]`);
  console.log();

  return { pass, modelKeywords, foundKeywords };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Health check
  try {
    const probe = await fetch(`${SERVER}/api/health`);
    if (!probe.ok) throw new Error('non-OK status');
  } catch {
    console.error(
      `Cannot reach ${SERVER}/api/health\n` +
      'Start the server with:  EVAL_MODE=1 node server/src/index.js\n',
    );
    process.exit(1);
  }

  // Eval endpoint check
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

  console.log('ResumeShift Eval v3 — Phase 2→3 Keyword Follow-Through');
  console.log('=======================================================');
  console.log(`Running ${CASES.length} test cases against ${SERVER}`);
  const jdCount = CASES.filter((c) => c.job_description).length;
  console.log(`  ${jdCount} JD-grounded  |  ${CASES.length - jdCount} general (skip)`);
  console.log('PASS = model used ≥2 of its own Phase 2 keywords in Phase 3\n');

  let passed        = 0;
  let totalFound    = 0;
  let totalModel    = 0;

  for (const tc of CASES) {
    const result = await runCase(tc);
    if (result.pass) passed++;
    totalFound += result.foundKeywords.length;
    totalModel += result.modelKeywords.length;
  }

  const followThrough = totalModel > 0
    ? (totalFound / totalModel).toFixed(2)
    : 'N/A';

  console.log('=======================================================');
  console.log(`Score                  : ${passed}/${CASES.length} PASS`);
  console.log(`Keyword follow-through : ${totalFound}/${totalModel} = ${followThrough}`);
  console.log('=======================================================');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
