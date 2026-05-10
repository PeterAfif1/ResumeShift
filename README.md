# ResumeShift

AI-powered resume analyzer and rewriter for CS students and recent grads.

## Stack

- **Frontend**: React + Vite
- **Backend**: Node.js + Express
- **AI**: OpenAI GPT-4o
- **PDF parsing**: pdf-parse

## Setup

### 1. Install dependencies

```bash
npm install
npm install --prefix server
npm install --prefix client
```

### 2. Configure environment

```bash
cp server/.env.example server/.env
```

Edit `server/.env` and add your OpenAI API key:

```
OPENAI_API_KEY=sk-...
PORT=3001
```

### 3. Run

Open two terminals:

```bash
# Terminal 1 — backend
cd server && npm run dev

# Terminal 2 — frontend
cd client && npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

## How it works

1. **Upload** — Drop a PDF resume. The server extracts text with `pdf-parse` and creates a session with a UUID.
2. **Phase 1** — The AI asks for your target role, experience level, and timeline.
3. **Phase 2** — Resume analysis rendered as a structured card: score ring, strengths/gaps, flagged bullets.
4. **Phase 3** — Bullet rewrites shown as before/after diffs with keyword chips.
5. **Phase 4** — Adjacent role matches with role-specific rewrites, navigable via tabs.

All message history is stored server-side per session. Sessions are in-memory — restart clears them.

## Notes

- Sessions are in-memory only. For production, swap `sessionStore.js` for Redis or a database.
- The server only accepts PDF files up to 10 MB.
- Scanned/image PDFs will fail text extraction — text-based PDFs only.
