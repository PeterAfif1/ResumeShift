import React from 'react';
import Phase2Card from './Phase2Card';
import Phase3Card from './Phase3Card';
import Phase4Card from './Phase4Card';
import './ResultsPanel.css';

export default function ResultsPanel({ results, latestCardRef }) {
  if (!results.length) {
    return (
      <div className="results-empty">
        <div className="results-empty__icon" aria-hidden="true">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect x="4" y="4" width="24" height="28" rx="3" stroke="#d1d1d6" strokeWidth="1.5"/>
            <path d="M9 11h14M9 16h10M9 21h7" stroke="#d1d1d6" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <p className="results-empty__title">Your analysis will appear here</p>
        <p className="results-empty__sub">Attach a resume and answer a few questions to get started.</p>
      </div>
    );
  }

  return (
    <div className="results-list">
      {results.map((r, i) => {
        const isLast = i === results.length - 1;
        const ref = isLast ? latestCardRef : null;

        if (r.phase === 2) return <div key={i} ref={ref}><Phase2Card data={r.parsed} /></div>;
        if (r.phase === 3) return <div key={i} ref={ref}><Phase3Card data={r.parsed} /></div>;
        if (r.phase === 4) return <div key={i} ref={ref}><Phase4Card data={r.parsed} /></div>;
        return null;
      })}
    </div>
  );
}
