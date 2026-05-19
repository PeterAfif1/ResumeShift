const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const OpenAI = require('openai');
const { getSession, updateResumeText, updateResumeProfile, appendMessage } = require('../sessionStore');

const router = express.Router({ mergeParams: true });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

    // Re-extract structured profile for the new resume (non-fatal if it fails)
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a resume parser. Extract structured data from the resume text and return ONLY valid JSON with this exact shape:\n' +
              '{\n' +
              '  "experience": ["<role> at <company> — <1-line summary>", ...],\n' +
              '  "education": ["<degree> in <field> from <school> (<year>)", ...],\n' +
              '  "skills": ["skill1", "skill2", ...],\n' +
              '  "projects": ["<project name> — <1-line summary>", ...]\n' +
              '}\n' +
              'Keep each entry concise (one line). Include all entries present. Return empty arrays if a section is absent. No markdown, no prose — raw JSON only.',
          },
          { role: 'user', content: resumeText },
        ],
        temperature: 0,
        max_tokens: 1000,
      });
      const raw = completion.choices[0].message.content.trim();
      const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      updateResumeProfile(sessionId, JSON.parse(jsonStr));
      console.log('[swapResume] profile re-extracted');
    } catch (err) {
      console.error('[swapResume] profile extraction failed (non-fatal):', err.message);
    }

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
