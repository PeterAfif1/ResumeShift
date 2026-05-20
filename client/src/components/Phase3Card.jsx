import React from 'react';
import './PhaseCards.css';

export default function Phase3Card({ data }) {
  return (
    <div className="card">
      <div className="card__header">
        <span className="card__badge">Phase 3</span>
        <h2 className="card__title">Bullet Rewrites</h2>
        <span className="card__count">{data.rewrites?.length ?? 0} bullets</span>
      </div>

      <div className="rewrite-list">
        {data.rewrites?.map((r, i) => (
          <div key={i} className="rw">

            {/* ── Before ── */}
            <div className="rw__before">
              <span className="rw__label rw__label--before">Original</span>
              <p className="rw__text rw__text--before">{r.original}</p>
            </div>

            {/* ── Divider ── */}
            <div className="rw__divider" aria-hidden="true">
              <span className="rw__divider-line" />
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 2v10M3 8l4 4 4-4" stroke="currentColor" strokeWidth="1.6"
                  strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="rw__divider-line" />
            </div>

            {/* ── After ── */}
            <div className="rw__after">
              <span className="rw__label rw__label--after">Rewritten</span>
              <p className="rw__text rw__text--after">{r.rewritten}</p>
            </div>

            {/* ── Keywords added ── */}
            {r.keywords_added?.length > 0 && (
              <div className="rw__keywords">
                <span className="kw-label">Keywords added:</span>
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
