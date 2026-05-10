require('dotenv').config();
const express = require('express');
const cors = require('cors');

const uploadRouter = require('./routes/upload');
const chatRouter = require('./routes/chat');
const swapResumeRouter = require('./routes/swapResume');
const evalSessionRouter = require('./routes/evalSession');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/upload', uploadRouter);
app.use('/api/chat', chatRouter);
app.use('/api/session/:sessionId/resume', swapResumeRouter);
app.use('/api/eval/session', evalSessionRouter);

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

const server = app.listen(PORT, () => {
  console.log(`ResumeShift server running on http://localhost:${PORT}`);
});

// 4 chained OpenAI calls can take 30-60s — give them room
server.timeout = 120000;
server.keepAliveTimeout = 120000;
