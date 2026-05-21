import React from 'react';
import Phase2Card from './Phase2Card';
import Phase3Card from './Phase3Card';
import Phase4Card from './Phase4Card';
import './ResultsPanel.css';

export default function ResultsPanel({ results, latestCardRef }) {
  if (!results.length) {
    return (
      <div className="results-empty">
        <p className="results-empty__title">How it works</p>
        <div className="results-steps">
          <div className="results-step">
            <span className="results-step__num">1</span>
            <div>
              <p className="results-step__heading">Upload your resume</p>
              <p className="results-step__body">Drop a PDF in the panel on the left. We extract your experience, skills, and projects automatically.</p>
            </div>
          </div>
          <div className="results-step">
            <span className="results-step__num">2</span>
            <div>
              <p className="results-step__heading">Tell us your target role</p>
              <p className="results-step__body">Answer three quick questions — target role, experience level, and timeline. Optionally paste a job description.</p>
            </div>
          </div>
          <div className="results-step">
            <span className="results-step__num">3</span>
            <div>
              <p className="results-step__heading">Get your analysis</p>
              <p className="results-step__body">A scored breakdown, rewritten bullets with missing keywords added, and adjacent roles you qualify for — all here.</p>
            </div>
          </div>
        </div>
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
