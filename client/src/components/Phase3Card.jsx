import React from 'react';
import './PhaseCards.css';

export default function Phase3Card({ data }) {
  return (
    <div className="card">
      <div className="card__header">
        <span className="card__badge">Rewrites</span>
        <h2 className="card__title">Bullet Rewrites</h2>
      </div>

      <div className="rewrite-list">
        {data.rewrites.map((r, i) => (
          <div key={i} className="rewrite">
            <div className="rewrite__before">
              <span className="rewrite__tag rewrite__tag--before">Before</span>
              <p className="rewrite__text rewrite__text--before">{r.original}</p>
            </div>
            <div className="rewrite__arrow" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 2v10M3 8l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="rewrite__after">
              <span className="rewrite__tag rewrite__tag--after">After</span>
              <p className="rewrite__text">{r.rewritten}</p>
            </div>
            {r.keywords_added?.length > 0 && (
              <div className="kw-row">
                <span className="kw-label">Added:</span>
                {r.keywords_added.map((kw, j) => (
                  <span key={j} className="chip chip--green">{kw}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
