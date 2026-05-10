import React, { useState } from 'react';
import './PhaseCards.css';

function ScoreDisplay({ score }) {
  const color =
    score >= 75 ? 'var(--green)' :
    score >= 50 ? 'var(--yellow)' :
    'var(--red)';
  const bg =
    score >= 75 ? 'var(--green-bg)' :
    score >= 50 ? 'var(--yellow-bg)' :
    'var(--red-bg)';
  const border =
    score >= 75 ? 'var(--green-border)' :
    score >= 50 ? 'var(--yellow-border)' :
    'var(--red-border)';
  const label =
    score >= 75 ? 'Strong' :
    score >= 50 ? 'Needs work' :
    'Weak';

  return (
    <div className="score-block" style={{ background: bg, borderColor: border }} aria-label={`Score: ${score} out of 100`}>
      <span className="score-num" style={{ color }}>{score}</span>
      <span className="score-label" style={{ color }}>{label}</span>
    </div>
  );
}

export default function Phase2Card({ data }) {
  const [expanded, setExpanded] = useState(null);

  return (
    <div className="card">
      <div className="card__header">
        <span className="card__badge">Analysis</span>
        <h2 className="card__title">Resume Score</h2>
      </div>

      {/* Score + summary */}
      <div className="score-row">
        <ScoreDisplay score={data.overall_score} />
        <p className="summary">{data.summary}</p>
      </div>

      {/* Strengths & Gaps */}
      <div className="two-col">
        <div className="col-block col-block--green">
          <p className="col-block__heading">Strengths</p>
          <ul className="col-block__list">
            {data.strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
        <div className="col-block col-block--red">
          <p className="col-block__heading">Gaps</p>
          <ul className="col-block__list">
            {data.gaps.map((g, i) => <li key={i}>{g}</li>)}
          </ul>
        </div>
      </div>

      {/* Flagged bullets */}
      {data.flagged_bullets?.length > 0 && (
        <div className="section">
          <div className="section__head">
            <p className="section__title">Flagged Bullets</p>
            <span className="badge badge--red">{data.flagged_bullets.length}</span>
          </div>
          <div className="accordion">
            {data.flagged_bullets.map((b, i) => (
              <div key={i} className="accordion__item">
                <button
                  className="accordion__trigger"
                  onClick={() => setExpanded(expanded === i ? null : i)}
                  aria-expanded={expanded === i}
                >
                  <span className="accordion__text">{b.original}</span>
                  <svg
                    className={`accordion__chevron ${expanded === i ? 'open' : ''}`}
                    width="14" height="14" viewBox="0 0 14 14" fill="none"
                    aria-hidden="true"
                  >
                    <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {expanded === i && (
                  <div className="accordion__body">
                    <p className="issue-label">Issue</p>
                    <p className="issue-text">{b.issue}</p>
                    {b.missing_keywords?.length > 0 && (
                      <div className="kw-row">
                        <span className="kw-label">Missing:</span>
                        {b.missing_keywords.map((kw, j) => (
                          <span key={j} className="chip chip--blue">{kw}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
