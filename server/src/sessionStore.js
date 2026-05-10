/**
 * In-memory session store.
 * Each session holds the full OpenAI message history and resume text.
 * For production, replace with Redis or a database.
 */

const sessions = new Map();

function createSession(sessionId, resumeText) {
  sessions.set(sessionId, {
    resumeText,
    resumeInjected: false,  // true once resume text is persisted in messages
    phase2Complete: false,  // true once Phase 2 analysis has run
    messages: [],           // { role, content } objects
    createdAt: Date.now(),
  });
}

function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

function appendMessage(sessionId, role, content) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);
  session.messages.push({ role, content });
}

function updateResumeText(sessionId, resumeText) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);
  session.resumeText = resumeText;
  session.resumeInjected = false; // re-inject new resume on next turn
  session.phase2Complete = false; // allow re-analysis with new resume
}

function deleteSession(sessionId) {
  sessions.delete(sessionId);
}

module.exports = { createSession, getSession, appendMessage, updateResumeText, deleteSession };
