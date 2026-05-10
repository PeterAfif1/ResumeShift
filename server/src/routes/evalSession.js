/**
 * Eval-only route — creates a session directly from plain text.
 * Only active when NODE_ENV=eval or EVAL_MODE=1.
 * Never expose this in production.
 */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { createSession } = require('../sessionStore');

const router = express.Router();

router.post('/', (req, res) => {
  if (!process.env.EVAL_MODE) {
    return res.status(403).json({ error: 'Eval endpoint disabled' });
  }
  const { resumeText } = req.body;
  if (!resumeText || typeof resumeText !== 'string' || !resumeText.trim()) {
    return res.status(400).json({ error: 'resumeText is required' });
  }
  const sessionId = uuidv4();
  createSession(sessionId, resumeText.trim());
  return res.json({ sessionId });
});

module.exports = router;
