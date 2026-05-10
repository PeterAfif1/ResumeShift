const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { v4: uuidv4 } = require('uuid');
const { createSession } = require('../sessionStore');

const router = express.Router();

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

    const sessionId = uuidv4();
    createSession(sessionId, resumeText);

    return res.json({ sessionId, charCount: resumeText.length });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: err.message || 'Failed to process PDF' });
  }
});

module.exports = router;
