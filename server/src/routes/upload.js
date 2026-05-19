const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { v4: uuidv4 } = require('uuid');
const OpenAI = require('openai');
const { createSession } = require('../sessionStore');

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Store file in memory — no disk writes needed
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted'));
    }
  },
});

/**
 * Uses gpt-4o-mini to extract structured profile data from raw resume text.
 * Returns { experience, education, skills, projects } or null on failure.
 */
async function extractResumeProfile(resumeText) {
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
        {
          role: 'user',
          content: resumeText,
        },
      ],
      temperature: 0,
      max_tokens: 1000,
    });

    const raw = completion.choices[0].message.content.trim();
    // Strip any accidental markdown fences
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const profile = JSON.parse(jsonStr);
    console.log('[upload] resume profile extracted — experience:', profile.experience?.length,
      '| education:', profile.education?.length,
      '| skills:', profile.skills?.length,
      '| projects:', profile.projects?.length);
    return profile;
  } catch (err) {
    console.error('[upload] profile extraction failed (non-fatal):', err.message);
    return null;
  }
}

router.post('/', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const data = await pdfParse(req.file.buffer);
    const resumeText = data.text.trim();

    if (!resumeText) {
      return res.status(422).json({ error: 'Could not extract text from PDF. Make sure it is not a scanned image.' });
    }

    // Extract structured profile — runs in parallel with session creation
    const resumeProfile = await extractResumeProfile(resumeText);

    const sessionId = uuidv4();
    createSession(sessionId, resumeText, resumeProfile);

    return res.json({ sessionId, charCount: resumeText.length });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: err.message || 'Failed to process PDF' });
  }
});

module.exports = router;
