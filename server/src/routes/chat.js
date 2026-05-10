const express = require('express');
const OpenAI = require('openai');
const SYSTEM_PROMPT = require('../systemPrompt');
const { getSession, appendMessage } = require('../sessionStore');

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Extract raw JSON from a model response that may contain:
 * - Plain JSON
 * - ```json ... ``` fenced blocks
 * - Prose before/after the JSON
 */
function extractJSON(content) {
  // 1. Try to pull out a fenced ```json ... ``` block first
  const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) return fenceMatch[1].trim();

  // 2. Try to find a bare JSON object { ... } spanning the whole content
  const objMatch = content.match(/(\{[\s\S]*\})/);
  if (objMatch) return objMatch[1].trim();

  return content.trim();
}

function detectPhase(content) {
  try {
    const parsed = JSON.parse(extractJSON(content));
    if (parsed.overall_score !== undefined) return 2;
    if (parsed.rewrites !== undefined) return 3;
    if (parsed.adjacent_roles !== undefined) return 4;
    return null;
  } catch {
    return null;
  }
}

function safeParseJSON(content) {
  try {
    return JSON.parse(extractJSON(content));
  } catch {
    return null;
  }
}

/**
 * Inject the resume into persistent session history exactly once.
 * Called from one place only — eliminates the double-injection race.
 */
function ensureResumeInjected(session, sessionId) {
  if (session.resumeInjected || !session.resumeText) return;
  appendMessage(sessionId, 'user', `Here is my resume:\n\n${session.resumeText}`);
  appendMessage(sessionId, 'assistant', 'Resume received. Please continue.');
  session.resumeInjected = true;
  console.log('[resume] injected into history — length:', session.resumeText.length);
}

// ─── classifier ─────────────────────────────────────────────────────────────

async function phase1IsComplete(conversationMessages) {
  console.log('[classifier] running — message count:', conversationMessages.length);

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a classifier. Given a conversation, answer ONLY with the JSON ' +
            '{"complete": true} if the user has clearly stated ALL THREE of: ' +
            '(1) target role, (2) experience level, (3) job-search timeline. ' +
            'Otherwise answer ONLY with {"complete": false}. No other text.',
        },
        ...conversationMessages,
      ],
      temperature: 0,
      max_tokens: 20,
    });
    const raw = res.choices[0].message.content.trim();
    console.log('[classifier] raw response:', raw);
    const result = JSON.parse(raw).complete === true;
    console.log('[classifier] complete:', result);
    return result;
  } catch (err) {
    console.error('[classifier] ERROR:', err.message);
    return false;
  }
}

// ─── phase runners ───────────────────────────────────────────────────────────

async function runPhase2(session, sessionId) {
  console.log('[phase2] called — resumeText length:', session.resumeText?.length ?? 0);

  // Single injection point — resume is guaranteed to be in history here
  ensureResumeInjected(session, sessionId);

  appendMessage(
    sessionId,
    'user',
    'I have provided my goals and my resume is above. Please proceed with Phase 2 — output the full resume analysis JSON.',
  );

  const openaiMessages = [{ role: 'system', content: SYSTEM_PROMPT }, ...session.messages];
  console.log('[phase2] sending to OpenAI — context:', openaiMessages.length, 'messages');

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: openaiMessages,
    temperature: 0.4,
  });

  const content = completion.choices[0].message.content;
  console.log('[phase2] raw response (first 500 chars):', content.slice(0, 500));

  appendMessage(sessionId, 'assistant', content);

  const phase = detectPhase(content);
  console.log('[phase2] detected phase:', phase);

  if (phase === 2) session.phase2Complete = true;

  return { phase, content, parsed: phase ? safeParseJSON(content) : null };
}

async function runPhase3(session, sessionId) {
  console.log('[phase3] called');

  appendMessage(
    sessionId,
    'user',
    'Now proceed with Phase 3. Rewrite every flagged bullet from the Phase 2 analysis above. Output the rewrites JSON.',
  );

  const openaiMessages = [{ role: 'system', content: SYSTEM_PROMPT }, ...session.messages];
  console.log('[phase3] sending to OpenAI — context:', openaiMessages.length, 'messages');

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: openaiMessages,
    temperature: 0.4,
  });

  const content = completion.choices[0].message.content;
  console.log('[phase3] raw response (first 500 chars):', content.slice(0, 500));

  appendMessage(sessionId, 'assistant', content);

  const phase = detectPhase(content);
  console.log('[phase3] detected phase:', phase);

  return { phase, content, parsed: phase ? safeParseJSON(content) : null };
}

// ─── route ──────────────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  const { sessionId, message } = req.body;

  console.log('\n─────────────────────────────────────────');
  console.log('[chat] message:', message?.slice(0, 80));
  console.log('[chat] sessionId:', sessionId);

  if (!sessionId || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'sessionId and message are required' });
  }

  const session = getSession(sessionId);
  if (!session) {
    console.log('[chat] session not found');
    return res.status(404).json({ error: 'Session not found. Please upload your resume again.' });
  }

  console.log('[chat] resumeText length:', session.resumeText?.length ?? 0);
  console.log('[chat] resumeInjected:', session.resumeInjected);
  console.log('[chat] phase2Complete:', session.phase2Complete);
  console.log('[chat] history length:', session.messages.length);

  // ── Inject resume on the first real user turn (after history is non-empty) ──
  // We do NOT inject on the very first message (history empty) because that's
  // the kickoff greeting — the model hasn't asked Phase 1 questions yet.
  // We inject starting from the second turn so the resume is in context for
  // all of Phase 1 Q&A and beyond.
  if (session.messages.length >= 1) {
    ensureResumeInjected(session, sessionId);
  }

  // Append the user's actual message
  appendMessage(sessionId, 'user', message);
  console.log('[chat] history after append:', session.messages.length);

  // ── Call OpenAI ──────────────────────────────────────────────────────────
  let firstContent, firstPhase;

  try {
    const openaiMessages = [{ role: 'system', content: SYSTEM_PROMPT }, ...session.messages];
    console.log('[chat] calling OpenAI — context:', openaiMessages.length, 'messages');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: openaiMessages,
      temperature: 0.4,
    });

    firstContent = completion.choices[0].message.content;
    firstPhase = detectPhase(firstContent);

    console.log('[chat] response phase:', firstPhase);
    console.log('[chat] response (first 300 chars):', firstContent.slice(0, 300));

    appendMessage(sessionId, 'assistant', firstContent);
  } catch (err) {
    console.error('[chat] OpenAI error:', err.message);
    return res.status(502).json({ error: 'OpenAI request failed: ' + err.message });
  }

  // ── Phase 2 came back directly (re-run) → chain Phase 3 ─────────────────
  if (firstPhase === 2) {
    session.phase2Complete = true;
    console.log('[chat] Phase 2 direct — chaining Phase 3');
    try {
      const phase3Turn = await runPhase3(session, sessionId);
      const adjacentPrompt = 'Would you like to see adjacent roles you may qualify for based on your resume?';
      appendMessage(sessionId, 'assistant', adjacentPrompt);
      return res.json({
        turns: [
          { phase: 2, content: firstContent, parsed: safeParseJSON(firstContent) },
          phase3Turn,
          { phase: null, content: adjacentPrompt, parsed: null, isAdjacentPrompt: true },
        ],
      });
    } catch (err) {
      console.error('[chat] Phase 3 chain error:', err.message);
      return res.json({
        turns: [{ phase: 2, content: firstContent, parsed: safeParseJSON(firstContent) }],
        warning: 'Rewrites failed to generate. Type "rewrite the bullets" to try again.',
      });
    }
  }

  // ── Any other structured phase (3 or 4) — return directly ───────────────
  if (firstPhase !== null) {
    console.log('[chat] structured phase', firstPhase, '— returning directly');
    return res.json({
      turns: [{ phase: firstPhase, content: firstContent, parsed: safeParseJSON(firstContent) }],
    });
  }

  // ── Plain text — check if Phase 1 is complete ────────────────────────────
  if (session.resumeText && !session.phase2Complete) {
    // Filter out the injected resume message so the classifier only sees
    // the actual conversation (role, level, timeline exchange)
    const conversationForClassifier = session.messages.filter(
      (m) => !(m.role === 'user' && m.content.startsWith('Here is my resume:')),
    );
    console.log('[chat] running classifier — messages:', conversationForClassifier.length);

    const complete = await phase1IsComplete(conversationForClassifier);
    console.log('[chat] classifier complete:', complete);

    if (complete) {
      console.log('[chat] Phase 1 done — auto-triggering Phase 2 → Phase 3');
      try {
        const phase2Turn = await runPhase2(session, sessionId);
        console.log('[chat] Phase 2 phase:', phase2Turn.phase);

        const phase3Turn = await runPhase3(session, sessionId);
        console.log('[chat] Phase 3 phase:', phase3Turn.phase);

        const adjacentPrompt = 'Would you like to see adjacent roles you may qualify for based on your resume?';
        appendMessage(sessionId, 'assistant', adjacentPrompt);

        return res.json({
          turns: [
            { phase: null, content: firstContent, parsed: null },
            phase2Turn,
            phase3Turn,
            { phase: null, content: adjacentPrompt, parsed: null, isAdjacentPrompt: true },
          ],
        });
      } catch (err) {
        console.error('[chat] Phase 2/3 error:', err.message);
        return res.json({
          turns: [{ phase: null, content: firstContent, parsed: null }],
          warning: 'Analysis failed to run. Type "analyse my resume" to try again.',
        });
      }
    }
  }

  // Phase 1 still in progress
  console.log('[chat] Phase 1 in progress — single turn');
  return res.json({
    turns: [{ phase: null, content: firstContent, parsed: null }],
  });
});

module.exports = router;
