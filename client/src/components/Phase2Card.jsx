import React, { useState } from 'react';
import './PhaseCards.css';

/* ── Score ring ─────────────────────────────────────────────────────────── */

function ScoreRing({ score, summary }) {
  const radius = 36;
  const circ   = 2 * Math.PI * radius;
  const fill   = circ - (score / 100) * circ;

  const color  = score >= 75 ? 'var(--green)'  : score >= 50 ? 'var(--yellow)'  : 'var(--red)';
  const bg     = score >= 75 ? 'var(--green-bg)' : score >= 50 ? 'var(--yellow-bg)' : 'var(--red-bg)';
  const border = score >= 75 ? 'var(--green-border)' : score >= 50 ? 'var(--yellow-border)' : 'var(--red-border)';
  const label  = score >= 75 ? 'Strong' : score >= 50 ? 'Needs work' : 'Weak';

  return (
    <div className="score-hero" style={{ '--score-color': color, '--score-bg': bg, '--score-border': border }}>
      <div className="score-ring-wrap" aria-label={`Score: ${score} out of 100`}>
        <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
          <circle cx="48" cy="48" r={radius} fill="none" stroke={bg} strokeWidth="8" />
          <circle
            cx="48" cy="48" r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={fill}
            transform="rotate(-90 48 48)"
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <div className="score-ring-inner">
          <span className="score-ring-num">{score}</span>
          <span className="score-ring-denom">/100</span>
        </div>
      </div>
      <div className="score-hero-right">
        <span className="score-verdict" style={{ color, background: bg, borderColor: border }}>
          {label}
        </span>
        {summary && <p className="score-summary">{summary}</p>}
      </div>
    </div>
  );
}

/* ── Severity badge ─────────────────────────────────────────────────────── */

/**
 * Infer severity from the issue text so gaps can be visually tiered.
 * High  → missing keywords / no metrics / weak verb
 * Med   → could be stronger / consider adding
 * Low   → everything else
 */
function severityOf(issue = '') {
  const t = issue.toLowerCase();
  if (/missing|no metric|weak verb|absent|lacks|not present/.test(t)) return 'high';
  if (/could|consider|improve|add|include/.test(t)) return 'med';
  return 'low';
}

const SEVERITY_LABEL = { high: 'High', med: 'Medium', low: 'Low' };
const SEVERITY_CLASS = { high: 'sev sev--high', med: 'sev sev--med', low: 'sev sev--low' };

/* ── Main component ─────────────────────────────────────────────────────── */

export default function Phase2Card({ data }) {
  const [expandedBullet, setExpandedBullet] = useState(null);

  const highGaps = data.gaps?.filter((_, i) =>
    severityOf(data.flagged_bullets?.[i]?.issue) === 'high'
  ) ?? [];

  return (
    <div className="card p2-card">

      {/* ── Header ── */}
      <div className="card__header">
        <span className="card__badge">Phase 2</span>
        <h2 className="card__title">Resume Analysis</h2>
      </div>

      {/* ── Score hero + summary ── */}
      <ScoreRing score={data.overall_score} summary={data.summary} />

      {/* ── Strengths & Gaps ── */}
      <div className="two-col">
        <div className="col-block col-block--green">
          <p className="col-block__heading">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" style={{ marginRight: '0.3rem', verticalAlign: 'middle' }}>
              <path d="M2 5.5L4 7.5L8 2.5" stroke="var(--green)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Strengths
          </p>
          <ul className="col-block__list">
            {data.strengths?.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>

        <div className="col-block col-block--red">
          <p className="col-block__heading">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" style={{ marginRight: '0.3rem', verticalAlign: 'middle' }}>
              <path d="M5 2v4M5 7.5v.5" stroke="var(--red)" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Gaps
          </p>
          <ul className="col-block__list gap-list">
            {data.gaps?.map((g, i) => {
              const sev = severityOf(data.flagged_bullets?.[i]?.issue);
              return (
                <li key={i} className="gap-item">
                  <span className={SEVERITY_CLASS[sev]} title={`${SEVERITY_LABEL[sev]} severity`}>
                    {SEVERITY_LABEL[sev]}
                  </span>
                  {g}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* ── Flagged bullets ── */}
      {data.flagged_bullets?.length > 0 && (
        <div className="section">
          <div className="section__head">
            <p className="section__title">Flagged Bullets</p>
            <span className="badge badge--red">{data.flagged_bullets.length}</span>
          </div>

          <div className="bullet-list">
            {data.flagged_bullets.map((b, i) => {
              const sev = severityOf(b.issue);
              const open = expandedBullet === i;
              return (
                <div key={i} className={`bullet-card bullet-card--${sev}`}>
                  {/* Original bullet text — always visible */}
                  <div className="bullet-card__top">
                    <span className={SEVERITY_CLASS[sev]}>{SEVERITY_LABEL[sev]}</span>
                    <p className="bullet-card__original">{b.original}</p>
                  </div>

                  {/* Issue — always visible */}
                  <div className="bullet-card__issue">
                    <span className="bullet-card__issue-label">Issue</span>
                    <span className="bullet-card__issue-text">{b.issue}</span>
                  </div>

                  {/* Missing keywords — toggle for space */}
                  {b.missing_keywords?.length > 0 && (
                    <div className="bullet-card__footer">
                      <button
                        className="bullet-card__kw-toggle"
                        onClick={() => setExpandedBullet(open ? null : i)}
                        aria-expanded={open}
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"
                          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        {open ? 'Hide' : `${b.missing_keywords.length} missing keyword${b.missing_keywords.length > 1 ? 's' : ''}`}
                      </button>
                      {open && (
                        <div className="kw-row" style={{ marginTop: '0.5rem' }}>
                          {b.missing_keywords.map((kw, j) => (
                            <span key={j} className="chip chip--blue">{kw}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
