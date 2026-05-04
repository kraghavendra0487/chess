import React from 'react';

/** Same glyphs/colors as RightSidebar best-lines row. */
export default function MoveClassIcon({ moveClass, title, className = '' }) {
  if (!moveClass) return null;
  const label = title ?? moveClass;
  return (
    <span
      className={`inline-flex justify-center items-center shrink-0 w-4 ${className}`.trim()}
      title={label}
      aria-label={label}
    >
      {moveClass === 'best' ? <i className="fas fa-star text-emerald-500" aria-hidden="true" /> : null}
      {moveClass === 'excellent' ? <i className="fas fa-thumbs-up text-emerald-500" aria-hidden="true" /> : null}
      {moveClass === 'good' ? <i className="fas fa-check text-emerald-500" aria-hidden="true" /> : null}
      {moveClass === 'inaccuracy' ? <i className="fas fa-question text-yellow-500" aria-hidden="true" /> : null}
      {moveClass === 'mistake' ? <i className="fas fa-times text-red-500" aria-hidden="true" /> : null}
      {moveClass === 'blunder' ? <span className="text-red-900 font-black text-[10px] leading-none" aria-hidden="true">??</span> : null}
      {moveClass === 'book' ? <i className="fas fa-book text-indigo-600" aria-hidden="true" /> : null}
      {moveClass === 'forced' ? <i className="fas fa-lock text-slate-500" aria-hidden="true" /> : null}
    </span>
  );
}
