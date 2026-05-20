import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { uploadResume, swapResume, sendMessage } from '../api';
import ResultsPanel from './ResultsPanel';
import './AppShell.css';

/* ─── helpers ─────────────────────────────────────────────── */

// Short user messages that are quick replies render as muted pill chips
const QUICK_REPLY_PATTERN = /^(yes|yes, show me|no|no thanks|skip|no jd)$/i;

// Detect the Phase 1.5 JD prompt so we can render a Skip button
const JD_PROMPT_PATTERN = /paste it here or type ['']?skip['']?/i;

function ChatMessage({ msg, onQuickReply }) {
  const isUser = msg.role === 'user';

  // Adjacent-roles yes/no prompt
  if (msg.isAdjacentPrompt) {
    return (
      <div className="cm cm--assistant">
        <div className="cm__prompt-block">
          <div className="cm__text cm__text--md">
            <ReactMarkdown>{msg.content}</ReactMarkdown>
          </div>
          <div className="cm__quick-replies">
            <button className="qr-btn qr-btn--yes" onClick={() => onQuickReply('Yes')}>
              Yes, show me
            </button>
            <button className="qr-btn qr-btn--no" onClick={() => onQuickReply('No thanks')}>
              No thanks
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Phase 1.5 JD prompt — show the message plus a Skip button (until answered)
  if (!isUser && !msg.jdPromptAnswered && JD_PROMPT_PATTERN.test(msg.content)) {
    return (
      <div className="cm cm--assistant">
        <div className="cm__prompt-block">
          <div className="cm__text cm__text--md">
            <ReactMarkdown>{msg.content}</ReactMarkdown>
          </div>
          <div className="cm__quick-replies">
            <button className="qr-btn qr-btn--no" onClick={() => onQuickReply('skip')}>
              Skip
            </button>
          </div>
        </div>
      </div>
    );
  }

  // User quick-reply chip
  if (isUser && QUICK_REPLY_PATTERN.test(msg.content.trim())) {
    return (
      <div className="cm cm--user-chip">
        <span className="cm__chip">{msg.content}</span>
      </div>
    );
  }

  return (
    <div className={`cm ${isUser ? 'cm--user' : 'cm--assistant'}`}>
      {isUser ? (
        <p className="cm__text">{msg.content}</p>
      ) : (
        <div className="cm__text cm__text--md">
          <ReactMarkdown>{msg.content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

/* ─── DropZone ────────────────────────────────────────────── */

function DropZone({ onFile, loading, error }) {
  const [dragging, setDragging] = useState(false);
  const zoneInputRef = useRef(null);

  function handleDragOver(e) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(e) {
    // Only clear if leaving the zone itself, not a child element
    if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  function handleInputChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onFile(file);
  }

  return (
    <div
      className={`drop-zone ${dragging ? 'drop-zone--over' : ''} ${loading ? 'drop-zone--loading' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !loading && zoneInputRef.current?.click()}
      role="button"
      tabIndex={0}
      aria-label="Upload resume PDF — click or drag and drop"
      onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? zoneInputRef.current?.click() : null}
    >
      <input
        ref={zoneInputRef}
        type="file"
        accept="application/pdf"
        style={{ display: 'none' }}
        onChange={handleInputChange}
        aria-hidden="true"
        tabIndex={-1}
      />

      {loading ? (
        <div className="drop-zone__inner">
          <span className="spinner drop-zone__spinner" aria-hidden="true" />
          <p className="drop-zone__label">Uploading…</p>
        </div>
      ) : (
        <div className="drop-zone__inner">
          <div className="drop-zone__icon" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect x="4" y="4" width="24" height="28" rx="3"
                stroke="currentColor" strokeWidth="1.5"/>
              <path d="M10 4v6a1 1 0 001 1h6" stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round"/>
              <path d="M16 17v8M12 21l4-4 4 4"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p className="drop-zone__label">
            {dragging ? 'Drop to upload' : 'Drop your resume here'}
          </p>
          <p className="drop-zone__sub">or <span className="drop-zone__browse">click to browse</span></p>
          <p className="drop-zone__hint">PDF only · max 10 MB</p>
          {error && <p className="drop-zone__error" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}

/* ─── PhaseProgress ───────────────────────────────────────── */

const PHASES = [
  { id: 1, label: 'Goal Setting' },
  { id: 2, label: 'Resume Analysis' },
  { id: 3, label: 'Bullet Rewrites' },
  { id: 4, label: 'Role Matching' },
];

function PhaseProgress({ currentPhase }) {
  return (
    <div className="phase-progress" role="list" aria-label="Progress">
      {PHASES.map((p, i) => {
        const done   = p.id < currentPhase;
        const active = p.id === currentPhase;
        const cls    = done ? 'pp-step pp-step--done'
                     : active ? 'pp-step pp-step--active'
                     : 'pp-step pp-step--upcoming';
        return (
          <React.Fragment key={p.id}>
            <div className={cls} role="listitem" aria-current={active ? 'step' : undefined}>
              <span className="pp-step__dot" aria-hidden="true">
                {done
                  ? <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  : null}
              </span>
              <span className="pp-step__label">{p.label}</span>
            </div>
            {i < PHASES.length - 1 && <span className="pp-connector" aria-hidden="true" />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ─── main component ──────────────────────────────────────── */

export default function AppShell({ onNewSession }) {
  const [sessionId, setSessionId]       = useState(null);
  const [messages, setMessages]         = useState([
    {
      role: 'assistant',
      content: 'Upload your resume to get started — then tell me what role you\'re targeting.',
    },
  ]);
  const [input, setInput]               = useState('');
  const [loadingStatus, setLoadingStatus] = useState(''); // '' | status string
  const [chatError, setChatError]       = useState('');

  // Cycle status messages while a long multi-phase request is in flight
  const loadingTimerRef = useRef(null);

  function startLoadingCycle() {
    const steps = [
      { ms: 0,     label: 'Thinking…' },
      { ms: 6000,  label: 'Analysing resume…' },
      { ms: 18000, label: 'Writing rewrites…' },
      { ms: 32000, label: 'Almost done…' },
    ];
    steps.forEach(({ ms, label }) => {
      const t = setTimeout(() => setLoadingStatus(label), ms);
      loadingTimerRef.current = loadingTimerRef.current || [];
      loadingTimerRef.current.push(t);
    });
  }

  function stopLoadingCycle() {
    (loadingTimerRef.current || []).forEach(clearTimeout);
    loadingTimerRef.current = [];
    setLoadingStatus('');
  }

  // Attach state
  const [attachedFile, setAttachedFile] = useState(null); // { name }
  const [attachLoading, setAttachLoading] = useState(false);
  const [attachError, setAttachError]   = useState('');

  // Results panel — accumulates structured phase data
  const [results, setResults]           = useState([]); // array of { phase, parsed }
  const latestCardRef   = useRef(null); // attached to the last card in ResultsPanel

  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);
  const fileInputRef = useRef(null);

  // Auto-resize textarea to fit content, up to 200px
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loadingStatus]);

  // Scroll results panel to the newest card whenever results change
  useEffect(() => {
    if (results.length > 0) {
      latestCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [results]);

  /**
   * Extract JSON from content that may be fenced (```json...```) or bare.
   * Returns the raw JSON string, or null if nothing JSON-like is found.
   */
  function extractJSON(content) {
    // 1. Fenced block
    const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch) return fenceMatch[1].trim();
    // 2. Bare object spanning most of the content
    const objMatch = content.match(/(\{[\s\S]*\})/);
    if (objMatch) return objMatch[1].trim();
    return null;
  }

  /**
   * Process an array of turns from the server.
   * Plain-text turns → chat messages column.
   * Structured turns (phase 2/3/4) → results panel only, never chat.
   * isAdjacentPrompt turns → chat messages column with quick-reply buttons.
   *
   * Detection is unconditional — any turn whose content parses to an object
   * with overall_score / rewrites / adjacent_roles is routed to the results
   * panel regardless of phase state or turn index.
   */
  function processTurns(turns, warning) {
    const newChatMsgs = [];
    const newResults  = [];

    for (const turn of turns) {
      // ── Primary path: server already detected and tagged the phase ──────
      if (turn.phase && turn.parsed) {
        newResults.push({ phase: turn.phase, parsed: turn.parsed });
        continue;
      }

      // ── Safety net: try to extract and classify JSON from the content ───
      // Handles cases where the server's detectPhase() returned null but the
      // model still emitted valid structured JSON (e.g. fenced, or with prose
      // around it). This is the path Phase 4 falls into when the server
      // returns phase: null for the adjacent_roles response.
      if (turn.content) {
        const raw = extractJSON(turn.content);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            const phase =
              parsed.overall_score  !== undefined ? 2 :
              parsed.rewrites       !== undefined ? 3 :
              parsed.adjacent_roles !== undefined ? 4 : null;
            if (phase) {
              newResults.push({ phase, parsed });
              continue;
            }
          } catch { /* not valid JSON — fall through to chat */ }
        }
      }

      // ── Plain text or adjacent-roles prompt → chat column ───────────────
      newChatMsgs.push({
        role: 'assistant',
        content: turn.content,
        isAdjacentPrompt: turn.isAdjacentPrompt || false,
      });
    }

    if (warning) {
      newChatMsgs.push({ role: 'assistant', content: `⚠ ${warning}` });
    }

    if (newChatMsgs.length) setMessages((prev) => [...prev, ...newChatMsgs]);
    if (newResults.length)  setResults((prev)   => [...prev, ...newResults]);
  }

  /* ── attach PDF ── */
  async function handleFile(file) {
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setAttachError('Only PDF files are accepted.');
      return;
    }

    setAttachError('');
    setAttachLoading(true);

    try {
      if (!sessionId) {
        const { sessionId: newId } = await uploadResume(file);
        setSessionId(newId);
        setAttachedFile({ name: file.name });
      } else {
        const { fileName } = await swapResume(sessionId, file);
        setAttachedFile({ name: fileName || file.name });
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: "Got it — I've loaded your updated resume. What would you like to do next? I can re-run the analysis, rewrite bullets, or match you to adjacent roles.",
          },
        ]);
      }
    } catch (err) {
      setAttachError(err.message);
      stopLoadingCycle();
    } finally {
      setAttachLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleAttach(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    handleFile(file);
  }

  /* ── send message ── */
  async function handleSend() {
    const text = input.trim();
    if (!text || loadingStatus || attachLoading) return;

    if (!sessionId) {
      setAttachError('Please attach your resume first using the + button.');
      return;
    }

    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');
    startLoadingCycle();
    setChatError('');

    try {
      const res = await sendMessage(sessionId, text);
      processTurns(res.turns, res.warning);
    } catch (err) {
      setChatError(err.message);
    } finally {
      stopLoadingCycle();
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleQuickReply(text) {
    // Dismiss any prompt buttons (adjacent-roles or JD skip) by marking them answered
    setMessages((prev) =>
      prev.map((m) => {
        if (m.isAdjacentPrompt) return { ...m, isAdjacentPrompt: false };
        if (!m.role || m.role !== 'user') {
          // Dismiss the JD prompt button once the user has responded
          if (JD_PROMPT_PATTERN.test(m.content || '')) return { ...m, jdPromptAnswered: true };
        }
        return m;
      }),
    );
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    startLoadingCycle();
    setChatError('');

    try {
      const res = await sendMessage(sessionId, text);
      processTurns(res.turns, res.warning);
    } catch (err) {
      setChatError(err.message);
    } finally {
      stopLoadingCycle();
      inputRef.current?.focus();
    }
  }

  /* ── render ── */
  // Derive current phase from accumulated results — no new state needed
  const phases = results.map((r) => r.phase);
  const currentPhase = phases.includes(4) ? 4
                     : phases.includes(3) ? 4   // rewrites done → highlight Role Matching next
                     : phases.includes(2) ? 3   // analysis done → highlight Bullet Rewrites
                     : 1;                        // nothing yet → Goal Setting

  return (
    <div className="shell">
      {/* ── Navbar ── */}
      <nav className="navbar">
        <div className="navbar__logo">
          <span className="navbar__logo-mark" aria-hidden="true">⇄</span>
          ResumeShift
        </div>
        <button className="navbar__new-btn" onClick={onNewSession}>
          New Session
        </button>
      </nav>

      {/* ── Body ── */}
      <div className="body">

        {/* Left — chat */}
        <section className="left-panel" aria-label="Chat">

          <PhaseProgress currentPhase={currentPhase} />

          {!sessionId ? (
            /* ── Pre-upload: full drop zone ── */
            <DropZone
              onFile={handleFile}
              loading={attachLoading}
              error={attachError}
            />
          ) : (
            /* ── Post-upload: chat + input ── */
            <>
              <div className="chat-messages" aria-live="polite">
                {messages.map((msg, i) => (
                  <ChatMessage key={i} msg={msg} onQuickReply={handleQuickReply} />
                ))}
                {loadingStatus && (
                  <div className="cm cm--assistant">
                    <span className="cm__status">
                      <span className="typing-dots" aria-hidden="true">
                        <span /><span /><span />
                      </span>
                      {loadingStatus}
                    </span>
                  </div>
                )}
                {chatError && (
                  <p className="chat-err" role="alert">⚠ {chatError}</p>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input area */}
              <div className="input-area">
                {attachedFile && (
                  <div className="pill-row">
                    <span className="pill pill--green">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <path d="M2 6.5L4.5 9L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      {attachedFile.name}
                      <button
                        className="pill__dismiss"
                        onClick={() => setAttachedFile(null)}
                        aria-label="Dismiss"
                      >×</button>
                    </span>
                  </div>
                )}
                {attachError && (
                  <p className="attach-err" role="alert">{attachError}</p>
                )}

                <div className="input-row">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    style={{ display: 'none' }}
                    onChange={handleAttach}
                    aria-hidden="true"
                  />

                  <button
                    className="icon-btn attach-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!!loadingStatus || attachLoading}
                    aria-label="Attach resume PDF"
                    title="Attach resume (PDF)"
                  >
                    {attachLoading
                      ? <span className="spinner" aria-hidden="true" />
                      : <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                        </svg>
                    }
                  </button>

                  <textarea
                    ref={inputRef}
                    className="chat-input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Message ResumeShift…"
                    rows={1}
                    disabled={!!loadingStatus || attachLoading}
                    aria-label="Message input"
                  />

                  <button
                    className="icon-btn send-btn"
                    onClick={handleSend}
                    disabled={!input.trim() || !!loadingStatus || attachLoading}
                    aria-label="Send message"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M8 13V3M3 8l5-5 5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Right — results */}
        <section className="right-panel" aria-label="Analysis results">
          <ResultsPanel results={results} latestCardRef={latestCardRef} />
        </section>

      </div>
    </div>
  );
}
