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
    jobDescription: null,   // string if user pasted a JD, null if skipped or not yet asked
    jdInjected: false,      // true once JD is persisted in messages
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
  session.jobDescription = null;  // clear JD — user should re-provide for new resume
  session.jdInjected = false;
}

function updateJobDescription(sessionId, jobDescription) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);
  // jobDescription is a string (the JD text) or null (user skipped)
  session.jobDescription = jobDescription;
}

function deleteSession(sessionId) {
  sessions.delete(sessionId);
}

module.exports = {
  createSession,
  getSession,
  appendMessage,
  updateResumeText,
  updateJobDescription,
  deleteSession,
};
