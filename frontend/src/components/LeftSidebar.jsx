import React, { useMemo, useState, useEffect, useRef } from 'react';
import MoveClassIcon from './MoveClassIcon';

function moveClassLabel(c) {
  if (!c) return null;
  if (c === 'book') return 'Book';
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function moveClassTextClass(c) {
  switch (c) {
    case 'best':
    case 'excellent':
    case 'good':
      return 'text-emerald-800';
    case 'inaccuracy':
      return 'text-yellow-800';
    case 'mistake':
      return 'text-red-600';
    case 'blunder':
      return 'text-red-900';
    case 'book':
      return 'text-indigo-700';
    default:
      return '';
  }
}

const LeftSidebar = ({
  history,
  navIndex,
  setNavIndex,
  timeline,
  loadPGN,
  mlOutputs,
  mlLoading,
  layout = 'sidebar',
  moveClassifications = [],
  boardWidth = 560,
}) => {
  const pageStack = layout === 'pageStack';
  const [pgnInput, setPgnInput] = useState('');
  const [showPgnInput, setShowPgnInput] = useState(false);
  const scrollContainerRef = useRef(null);
  
  const isInitialPosition = navIndex === 0;

  const getClass8ColorClasses = (cls) => {
    const c = (cls || '').toLowerCase();
    switch (c) {
      case 'forced': return { badge: 'bg-slate-500/10 text-slate-400', bar: 'bg-slate-500' };
      case 'book': return { badge: 'bg-indigo-500/10 text-indigo-400', bar: 'bg-indigo-500' };
      case 'best': return { 
        badge: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20', 
        bar: 'flowing-glow shadow-[0_0_8px_rgba(16,185,129,0.4)]',
        isBest: true 
      };
      case 'excellent': return { badge: 'bg-emerald-500/20 text-emerald-500', bar: 'bg-emerald-500' };
      case 'good': return { badge: 'bg-emerald-400/20 text-emerald-400', bar: 'bg-emerald-400' };
      case 'inaccuracy': return { badge: 'bg-amber-500/10 text-amber-400', bar: 'bg-amber-500' };
      case 'mistake': return { badge: 'bg-rose-500/10 text-rose-400', bar: 'bg-rose-500' };
      case 'blunder': return { badge: 'bg-rose-900/20 text-rose-600', bar: 'bg-rose-900' };
      default: return { badge: 'bg-slate-500/10 text-slate-400', bar: 'bg-slate-500' };
    }
  };

  // useEffect(() => {
  //   if (activeMoveRef.current && scrollContainerRef.current) {
  //     activeMoveRef.current.scrollIntoView({
  //       behavior: 'smooth',
  //       block: 'nearest',
  //     });
  //   }
  // }, [navIndex]);

  const movePairs = useMemo(() => {
    const res = [];
    for (let i = 0; i < history.length; i += 2) {
      res.push({
        num: Math.floor(i / 2) + 1,
        w: history[i]?.san,
        b: history[i + 1]?.san,
        wClock: history[i]?.clock,
        bClock: history[i + 1]?.clock,
        wClass: moveClassifications[i] ?? null,
        bClass: moveClassifications[i + 1] ?? null,
      });
    }
    return res;
  }, [history, moveClassifications]);

  const handleLoadPgn = () => {
    if (loadPGN(pgnInput)) {
      setPgnInput('');
      setShowPgnInput(false);
    } else {
      alert('Invalid or empty PGN. Please check the format and try again.');
    }
  };

  return (
    <>
      <style>{`
        @keyframes flowGlow {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .flowing-glow {
          background: linear-gradient(90deg, 
            #10b981 0%, 
            #34d399 25%, 
            #10b981 50%, 
            #34d399 75%, 
            #10b981 100%
          );
          background-size: 200% 100%;
          animation: flowGlow 3s linear infinite;
        }
      `}</style>
      <aside
        className={
          pageStack
            ? 'w-full flex flex-col gap-4 shrink-0 lg:w-64'
            : 'w-full lg:w-64 flex flex-col gap-4 shrink-0 h-full min-h-0 lg:max-h-none overflow-visible'
        }
        style={!pageStack ? { height: `${boardWidth + 112}px` } : {}}
      >
      {/* Move History Box (50% of board height + 72px) */}
      <div
        className="bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden shadow-sm shrink-0"
        style={{ height: `${(boardWidth / 2) + 72}px` }}
      >
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900 shrink-0">
          <h2 className="font-bold text-[10px] uppercase tracking-widest text-white">Move History</h2>
          <button 
            className="text-white/70 hover:text-white transition-colors"
            onClick={() => setShowPgnInput(!showPgnInput)}
            title="Import PGN"
          >
            <i className="fas fa-file-import text-xs"></i>
          </button>
        </div>

        {showPgnInput && (
          <div className="p-3 bg-slate-50 border-b border-white flex flex-col gap-2 shrink-0">
            <textarea
              className="w-full h-24 p-2 text-[10px] font-mono border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none bg-white"
              placeholder="Paste PGN here..."
              value={pgnInput}
              onChange={(e) => setPgnInput(e.target.value)}
            />
            <div className="flex gap-2">
              <button 
                className="flex-1 bg-indigo-600 text-white py-1.5 rounded-lg text-[10px] font-bold hover:bg-indigo-700 transition shadow-sm"
                onClick={handleLoadPgn}
              >
                Load Game
              </button>
              <button 
                className="px-3 bg-white border border-slate-200 text-slate-400 py-1.5 rounded-lg text-[10px] font-bold hover:bg-slate-50 transition"
                onClick={() => setShowPgnInput(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar"
        >
          {movePairs.map((pair, i) => (
            <div key={i} className="grid grid-cols-[25px_1fr_1fr] gap-2 items-center text-sm">
              <span className="text-[10px] text-slate-300 font-bold">{pair.num}.</span>
              <div
                className={`move-pill flex flex-col items-start gap-0.5 min-w-0 ${navIndex === i * 2 + 1 ? 'active' : 'hover:bg-slate-50'}`}
                onClick={() => setNavIndex(i * 2 + 1)}
              >
                <div className="flex items-center gap-1 w-full">
                  <MoveClassIcon moveClass={pair.wClass} title={moveClassLabel(pair.wClass) || undefined} />
                  <span className={`truncate min-w-0 ${moveClassTextClass(pair.wClass)}`}>{pair.w}</span>
                </div>
                {pair.wClock && <span className="text-[9px] text-slate-400 font-mono ml-4 opacity-70">{pair.wClock}</span>}
              </div>
              {pair.b ? (
                <div
                  className={`move-pill flex flex-col items-start gap-0.5 min-w-0 ${navIndex === i * 2 + 2 ? 'active' : 'hover:bg-slate-50'}`}
                  onClick={() => setNavIndex(i * 2 + 2)}
                >
                  <div className="flex items-center gap-1 w-full">
                    <MoveClassIcon moveClass={pair.bClass} title={moveClassLabel(pair.bClass) || undefined} />
                    <span className={`truncate min-w-0 ${moveClassTextClass(pair.bClass)}`}>{pair.b}</span>
                  </div>
                  {pair.bClock && <span className="text-[9px] text-slate-400 font-mono ml-4 opacity-70">{pair.bClock}</span>}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        
        <div className="p-2 border-t border-white grid grid-cols-4 gap-1 shrink-0 bg-slate-50/30">
          <button className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors" onClick={() => setNavIndex(0)} title="Start"><i className="fas fa-fast-backward text-xs"></i></button>
          <button className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors" onClick={() => setNavIndex(Math.max(0, navIndex - 1))} title="Previous"><i className="fas fa-chevron-left text-xs"></i></button>
          <button className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors" onClick={() => setNavIndex(Math.min(timeline.length - 1, navIndex + 1))} title="Next"><i className="fas fa-chevron-right text-xs"></i></button>
          <button className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors" onClick={() => setNavIndex(timeline.length - 1)} title="End"><i className="fas fa-fast-forward text-xs"></i></button>
        </div>
      </div>

      {/* Pipeline Predictions Box (Fixed height, 50px shorter than Move History) */}
      <div
        className="bg-slate-900 border border-slate-800 rounded-2xl flex flex-col shadow-sm shrink-0 overflow-hidden"
        style={{ height: `${(boardWidth / 2) + 24}px` }}
      >
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50 shrink-0">
          <h2 className="font-bold text-[10px] uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <span className="text-indigo-400">🤖</span> Pipeline Predictions
            {mlLoading && (
              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse"></span>
            )}
          </h2>
          <i className="fas fa-robot text-slate-600 text-xs"></i>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {mlOutputs && !mlOutputs.error ? (
            <div className="divide-y divide-slate-800">
              {Object.entries(mlOutputs).map(([name, pred]) => {
                const colors = getClass8ColorClasses(pred.class8);
                return (
                  <div key={name} className="p-3 hover:bg-slate-800/30 transition-colors flex flex-col gap-2">
                    <div className="flex justify-between items-center gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[10px] font-bold text-slate-200 uppercase tracking-tight whitespace-nowrap shrink-0">
                          {name.replace('pipeline', 'Model ')}
                        </span>
                        <span className="text-[8px] font-medium text-slate-500 uppercase tracking-tighter truncate">
                          {name === 'pipeline1' ? 'XGBoost → Random Forest' : 
                           name === 'pipeline2' ? 'XGBoost → XGBoost' : 
                           'XGBoost → Gradient Boosting'}
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase shrink-0 ${colors.badge}`}>
                        {pred.class8 || 'unknown'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1 flex-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${colors.bar}`} style={{ width: '100%' }}></div>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-slate-100 bg-slate-800 px-2 py-0.5 rounded">
                        {pred.class3 || '—'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : mlOutputs?.error ? (
            <div className="p-6 text-center text-rose-400 text-[10px] italic">
              Error: {mlOutputs.error}
            </div>
          ) : mlLoading ? (
            <div className="p-4 space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse space-y-2">
                  <div className="flex justify-between">
                    <div className="h-2 w-12 bg-slate-800 rounded"></div>
                    <div className="h-3 w-16 bg-slate-800 rounded-full"></div>
                  </div>
                  <div className="h-1.5 w-full bg-slate-800/50 rounded-full"></div>
                </div>
              ))}
            </div>
          ) : isInitialPosition ? (
            <div className="p-8 text-center text-indigo-400/70 font-medium italic text-[10px] leading-relaxed">
              Predictions appear after the first move.
            </div>
          ) : (
            <div className="p-8 text-center text-slate-600 italic text-[10px]">
              Select a move to see predictions.
            </div>
          )}
        </div>
      </div>
    </aside>
    </>
  );
};

export default LeftSidebar;
