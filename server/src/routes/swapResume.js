const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { getSession, updateResumeText, appendMessage } = require('../sessionStore');

const router = express.Router({ mergeParams: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted'));
    }
  },
});

/**
 * POST /api/session/:sessionId/resume
 * Replaces the resume text for an existing session and injects it into
 * the message history so the model is aware of the new content.
 */
router.post('/', upload.single('resume'), async (req, res) => {
  const { sessionId } = req.params;

  const session = getSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found. Please start a new conversation.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded' });
  }

  try {
    const data = await pdfParse(req.file.buffer);
    const resumeText = data.text.trim();

    if (!resumeText) {
      return res.status(422).json({
        error: 'Could not extract text from PDF. Make sure it is not a scanned image.',
      });
    }

    // Update the session's resume text so future chat calls use it
    updateResumeText(sessionId, resumeText);

    // Inject the new resume into the conversation history so the model
    // sees it in context — same pattern as the initial first-message injection.
    const userInjection = `I've uploaded a new resume. Here is the updated resume text:\n\n${resumeText}`;
    appendMessage(sessionId, 'user', userInjection);
    appendMessage(sessionId, 'assistant', 'Got it — I\'ve loaded your new resume. What would you like to do next? I can re-run the analysis, rewrite bullets, or match you to adjacent roles.');

    return res.json({
      fileName: req.file.originalname,
      charCount: resumeText.length,
    });
  } catch (err) {
    console.error('Resume swap error:', err);
    return res.status(500).json({ error: err.message || 'Failed to process PDF' });
  }
});

module.exports = router;
