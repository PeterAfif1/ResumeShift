import React, { useState } from 'react';
import './PhaseCards.css';

export default function Phase4Card({ data }) {
  const [active, setActive] = useState(0);
  const roles = data.adjacent_roles ?? [];
  const role  = roles[active];

  return (
    <div className="card p4-card">
      <div className="card__header">
        <span className="card__badge">Phase 4</span>
        <h2 className="card__title">Adjacent Role Matches</h2>
        <span className="card__count">{roles.length} roles</span>
      </div>

      {/* ── Role selector ── */}
      <div className="p4-tabs" role="tablist" aria-label="Adjacent roles">
        {roles.map((r, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={active === i}
            aria-controls={`p4-panel-${i}`}
            id={`p4-tab-${i}`}
            className={`p4-tab ${active === i ? 'p4-tab--active' : ''}`}
            onClick={() => setActive(i)}
          >
            {r.title}
          </button>
        ))}
      </div>

      {/* ── Role panel ── */}
      {role && (
        <div
          id={`p4-panel-${active}`}
          role="tabpanel"
          aria-labelledby={`p4-tab-${active}`}
          className="p4-panel"
        >
          {/* Role hero */}
          <div className="p4-role-hero">
            <h3 className="p4-role-title">{role.title}</h3>
            <p className="p4-fit-reason">{role.fit_reason}</p>
          </div>

          {/* Rewrites */}
          {role.rewrites?.length > 0 && (
            <div className="p4-rewrites">
              <p className="section__title" style={{ marginBottom: '0.6rem' }}>
                Role-specific rewrites
                <span className="card__count" style={{ marginLeft: '0.5rem' }}>
                  {role.rewrites.length}
                </span>
              </p>

              <div className="rewrite-list">
                {role.rewrites.map((rw, i) => (
                  <div key={i} className="rw">

                    <div className="rw__before">
                      <span className="rw__label rw__label--before">Original</span>
                      <p className="rw__text rw__text--before">{rw.original}</p>
                    </div>

                    <div className="rw__divider" aria-hidden="true">
                      <span className="rw__divider-line" />
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M7 2v10M3 8l4 4 4-4" stroke="currentColor" strokeWidth="1.6"
                          strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span className="rw__divider-line" />
                    </div>

                    <div className="rw__after">
                      <span className="rw__label rw__label--after">Rewritten</span>
                      <p className="rw__text rw__text--after">{rw.rewritten}</p>
                    </div>

                    {rw.keywords_added?.length > 0 && (
                      <div className="rw__keywords">
                        <span className="kw-label">Keywords added:</span>
                        {rw.keywords_added.map((kw, j) => (
                          <span key={j} className="chip chip--green">{kw}</span>
                        ))}
                      </div>
                    )}

                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
