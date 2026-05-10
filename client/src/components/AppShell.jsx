import React, { useEffect, useRef, useState } from 'react';
import { uploadResume, swapResume, sendMessage } from '../api';
import ResultsPanel from './ResultsPanel';
import './AppShell.css';

/* ─── helpers ─────────────────────────────────────────────── */

function ChatMessage({ msg, onQuickReply }) {
  const isUser = msg.role === 'user';

  if (msg.isAdjacentPrompt) {
    return (
      <div className="cm cm--assistant">
        <span className="cm__avatar" aria-hidden="true">RS</span>
        <div className="cm__prompt-block">
          <p className="cm__text">{msg.content}</p>
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

  return (
    <div className={`cm ${isUser ? 'cm--user' : 'cm--assistant'}`}>
      {!isUser && <span className="cm__avatar" aria-hidden="true">RS</span>}
      <p className="cm__text">
        {msg.content.split('\n').map((line, i, arr) => (
          <React.Fragment key={i}>
            {line}{i < arr.length - 1 && <br />}
          </React.Fragment>
        ))}
      </p>
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
   * Process an array of turns from the server.
   * Plain-text turns → chat messages column.
   * Structured turns (phase 2/3/4) → results panel only, never chat.
   * isAdjacentPrompt turns → chat messages column with quick-reply buttons.
   */
  function processTurns(turns, warning) {
    const newChatMsgs = [];
    const newResults  = [];

    for (const turn of turns) {
      if (turn.phase && turn.parsed) {
        // Structured phase card — right panel only
        newResults.push({ phase: turn.phase, parsed: turn.parsed });
      } else {
        // Client-side safety net: if the content looks like raw JSON
        // (starts with { after stripping fences), don't show it in chat.
        const trimmed = turn.content.replace(/```(?:json)?/gi, '').trim();
        const looksLikeJSON = trimmed.startsWith('{') && trimmed.endsWith('}');
        if (looksLikeJSON) {
          // Try to parse and route it ourselves
          try {
            const parsed = JSON.parse(trimmed);
            const phase =
              parsed.overall_score !== undefined ? 2 :
              parsed.rewrites !== undefined ? 3 :
              parsed.adjacent_roles !== undefined ? 4 : null;
            if (phase) {
              newResults.push({ phase, parsed });
              continue;
            }
          } catch { /* fall through to chat */ }
        }

        newChatMsgs.push({
          role: 'assistant',
          content: turn.content,
          isAdjacentPrompt: turn.isAdjacentPrompt || false,
        });
      }
    }

    if (warning) {
      newChatMsgs.push({ role: 'assistant', content: `⚠ ${warning}` });
    }

    if (newChatMsgs.length) setMessages((prev) => [...prev, ...newChatMsgs]);
    if (newResults.length)  setResults((prev)   => [...prev, ...newResults]);
  }

  /* ── attach PDF ── */
  async function handleAttach(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setAttachError('Only PDF files are accepted.');
      return;
    }

    setAttachError('');
    setAttachLoading(true);

    try {
      if (!sessionId) {
        // First resume — create a new session via /upload
        const { sessionId: newId } = await uploadResume(file);
        setSessionId(newId);
        setAttachedFile({ name: file.name });
        // No kickoff message — the model's opening greeting already stands.
        // Phase 1 Q&A starts when the user types their first message.
      } else {
        // Subsequent resume — swap via /session/:id/resume
        const { fileName } = await swapResume(sessionId, file);
        setAttachedFile({ name: fileName || file.name });

        // Inject into server history; mirror a clean assistant ack in the UI
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
    setMessages((prev) =>
      prev.map((m) => (m.isAdjacentPrompt ? { ...m, isAdjacentPrompt: false } : m)),
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

          <div className="chat-messages" aria-live="polite">
            {messages.map((msg, i) => (
              <ChatMessage key={i} msg={msg} onQuickReply={handleQuickReply} />
            ))}
            {loadingStatus && (
              <div className="cm cm--assistant">
                <span className="cm__avatar" aria-hidden="true">RS</span>
                <span className="cm__status">
                  <span className="status-dot" aria-hidden="true" />
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
            {/* Pill */}
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
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                style={{ display: 'none' }}
                onChange={handleAttach}
                aria-hidden="true"
              />

              {/* + button */}
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
                placeholder={sessionId ? 'Message ResumeShift…' : 'Attach a resume to begin…'}
                rows={1}
                disabled={!!loadingStatus || attachLoading}
                aria-label="Message input"
              />

              {/* Send button */}
              <button
                className="icon-btn send-btn"
                onClick={handleSend}
                disabled={!input.trim() || !!loadingStatus || attachLoading || !sessionId}
                aria-label="Send message"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 13V3M3 8l5-5 5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
        </section>

        {/* Right — results */}
        <section className="right-panel" aria-label="Analysis results">
          <ResultsPanel results={results} latestCardRef={latestCardRef} />
        </section>

      </div>
    </div>
  );
}
