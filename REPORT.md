# REPORT.md — ResumeShift

## Part 1: What & Why

ResumeShift is an AI-powered resume analyzer and rewriter built for CS students and recent grads who are actively applying to jobs. The core problem it solves is specific: most students waste hours manually tweaking their resume for every application without knowing which keywords to target, which bullets are weak, or which roles they actually qualify for. ResumeShift automates that process — upload a PDF resume, answer a few questions about your target role, and get a scored line-level analysis, rewritten bullets, and a list of adjacent roles you realistically qualify for.

The app uses GPT-4o in a stateful multi-turn conversation across four phases: goal extraction (plus an optional job description step), resume analysis, bullet rewrites, and adjacent role matching. The user can optionally paste a job description to ground the analysis against a specific posting rather than a general role inference.

What makes the AI behavior hard to get right is the gap between instruction and execution. Telling the model to "add missing keywords" produces paraphrases and synonyms, not the exact phrases that ATS systems and recruiters scan for. Getting the model to use verbatim keyword phrases consistently — across varied resume styles, different target roles, and both CS and non-CS fields — required multiple prompt iterations and a measurable eval framework to verify. A single prompt call also cannot work here: each phase depends on the output of the previous one. The goals must come before the analysis, the analysis must come before the rewrites, and the adjacent role suggestions depend on what gaps were found — not just the raw resume.

---

## Part 2: Iterations

### V1 — Baseline

Change: Initial system prompt with no explicit keyword instruction. Eval script checked whether hardcoded keywords from test cases appeared in the model's rewritten bullets.

Motivating example: Test case 3 (UX Researcher) — the model rewrote "Conducted interviews with students about app usage" but used "qualitative research" instead of the expected "qualitative analysis." The eval marked it FAIL because the exact string was absent.

Delta: keyword_hit_rate = 0.10 (1/10 PASS, 3/30 keywords hit)

Conclusion: The low score revealed two compounding problems: the prompt did not enforce verbatim keyword usage, and the eval was checking against hardcoded keywords the model never saw. Both needed to be fixed independently. Next step: fix the prompt first, then reassess whether the eval metric itself is sound.

---

### V2 — Verbatim Keyword Instruction

Change: Added explicit instruction to Phase 3 to incorporate missing keywords VERBATIM — copy the exact phrase, do not paraphrase or substitute synonyms. Also added to Rules: never paraphrase or substitute synonyms for keywords, use the exact phrases verbatim.

Motivating example: Test case 6 (Junior Accountant) — the model wrote "reconciled accounts" instead of "reconciliation," which is a correct rewrite but failed exact string matching. The prompt change was meant to force the model to use the exact phrase.

Delta: keyword_hit_rate = 0.07 (0/10 PASS, 2/30 keywords hit) — regression

Conclusion: The score dropped slightly because the eval was still checking hardcoded keywords the model never received. The prompt change alone could not fix that. The real issue was the eval methodology, not the model's output quality. Next step: fix the eval to measure what the model actually does, not what we expected it to do.

---

### V3 — Eval Methodology Fix

Change: Rewrote eval/run_eval.js to extract the model's own missing_keywords from the Phase 2 response instead of checking against hardcoded test case keywords. PASS/FAIL is now determined by whether the model followed through on the keywords it flagged in Phase 2 — a fair measure of the model's internal consistency across phases.

Motivating example: Test case 2 (SWE Intern) — the model flagged "query optimization" and "database schema" in Phase 2 and used both in Phase 3, but the hardcoded eval expected "scalability" and "backend development." The model was right; the eval was wrong.

Delta: keyword_hit_rate = 0.78 (10/10 PASS, 25/32 keywords followed through) — major improvement

Conclusion: The jump from 0.07 to 0.78 confirms the V1/V2 model output was actually reasonable — the metric was measuring the wrong thing. Fixing the eval to reflect the model's own Phase 2 keywords gives a meaningful and honest measure of multi-turn consistency. Next step: add JD grounding to improve keyword relevance for specific applications.

---

### V4 — Optional Job Description Input

Change: Added Phase 1.5 between goal extraction and resume analysis. The model asks the user to paste a job description or type skip. If a JD is provided, Phase 2 extracts specific skill keywords and competency phrases from the JD instead of inferring them from the role name. Three eval test cases were updated to include a fake JD. Initial deploy scored 0.76 — a regression. The Phase 2 JD instruction was then refined to not flag generic tech stack terms unless explicitly required in the JD and completely absent from the resume. This brought the score back up.

Motivating example: Test case 8 (Junior Full-Stack Engineer, JD-grounded) — the model flagged JavaScript, React, and Node.js from the JD when the bullet was about CI/CD setup. These are generic tech terms already present elsewhere in the resume, not the action-oriented keywords the bullet was missing. The refined instruction fixed this.

Delta: keyword_hit_rate = 0.76 (initial) → 0.81 after prompt refinement

Conclusion: The feature improves real-world usefulness — JD grounding produces more targeted rewrites than general role inference. The initial regression to 0.76 was caused by the model over-indexing on generic tech stack terms. Refining the instruction to prioritize action-oriented and competency phrases recovered the score to 0.81. Next step: add few-shot examples of good vs. bad JD keyword extraction to the prompt.

---

### V5 — Post-Analysis Conversation Quality

Change: Rewrote the POST-ANALYSIS CONVERSATION section of the system prompt to enforce blunt, direct responses and prevent hallucination of resume details.

Motivating example: After Phase 3 completed, asking "Should I replace my capstone with this project?" returned a generic numbered list with fabricated metrics ("increasing keyword hit rate by 20%") despite no such number existing in the resume or analysis.

Delta: Replaced the neutral free-form instructions with explicit behavioral rules: answer directly in the first sentence, no numbered lists, no hedging, reference actual resume content only, and ask clarifying questions before writing bullets for projects not in the resume.

Conclusion: Responses became specific and direct. Hallucinated metrics no longer appear, the model now asks for details before generating bullets for projects it has no data on.

---

## Part 3: Code Walkthrough

A user uploads a PDF and types "Junior Full-Stack Engineer, new grad, actively applying, skip JD." Here is how the code handles it end to end.

upload.js (lines ~28–36) receives the multipart PDF via multer, extracts text using pdf-parse, creates a session UUID via sessionStore.js, and stores the resume text in the in-memory session Map. It returns the sessionId to the client.

AppShell.jsx (line ~57) declares the session ID state. After upload (line ~183), the session ID is stored and Phase 1 Q&A begins when the user sends their first message (line ~226). chat.js defines ensureResumeInjected() at line ~52, which checks the session's resumeInjected flag and is called on every turn; it injects the resume text as a user message into the OpenAI message history exactly once per session.

The main OpenAI call returns a Phase 1 response asking for goals. After the user provides all three, chat.js calls phase1IsComplete() — defined at line ~64 and invoked in the route handler at line ~313 — a cheap gpt-4o-mini classifier call with temperature 0 and max_tokens 20 that returns complete true or false. When complete, runPhase2() fires automatically, followed immediately by runPhase3().

The design decision to use a classifier instead of regex to detect Phase 1 completion was intentional. Regex would fail on inputs like "new grad targeting SWE intern, actively applying" where all three fields are in one sentence with no clear delimiter. The classifier handles natural language variation that regex cannot. The alternative considered was a structured form for Phase 1 instead of free-text chat — rejected because it would remove the conversational feel and be harder to demo.

Phase 2 and Phase 3 JSON responses are detected client-side in AppShell.jsx around line ~140 by checking for overall_score and rewrites keys. They are routed to the results panel, never the chat column.

---

## Part 4: AI Disclosure & Safety

Kiro was used to scaffold the entire project structure, implement the server routes, build the React components, and write the eval runner. It handled the majority of the boilerplate code based on specifications provided in natural language.

Three specific moments where Kiro failed and required manual recovery. First, Kiro built Phase 2 and Phase 3 as separate sequential HTTP requests from the client, meaning the client had to send a second request to trigger Phase 3. This caused the app to hang after Phase 2 with no visible progress. The fix was to move the Phase 2 to Phase 3 auto-chain entirely to the server in chat.js, returning both responses in a single turns array. Second, Kiro's initial phase detection used keyword scanning on raw message content — checking if the string "overall_score" appeared in the assistant message — rather than a boolean flag. This caused Phase 2 to re-trigger on subsequent turns if the user's message happened to contain those words. The fix was to replace content scanning with a phase2Complete boolean stored in the session. Third, Kiro set max_tokens to 2000 on the Phase 1.5 JD classifier, which would truncate long job descriptions mid-processing. This was caught during a code audit and bumped to 4000.

The primary safety risk in ResumeShift is hallucination of impact metrics. The Phase 3 prompt instructs the model not to fabricate specific numbers the user never mentioned, but the model occasionally adds phrases like "improving user engagement by 30%" with no basis in the original bullet. This is a direct harm: a user who copies the rewrite without reading carefully could submit a resume with fabricated metrics, which constitutes resume fraud. The mitigation chosen is the prompt instruction plus the before/after UI that forces the user to explicitly compare the original and rewritten bullet before using it. A stricter mitigation would be a post-processing check that flags any numeric claim in a rewrite absent from the original — not implemented in this version due to time constraints.