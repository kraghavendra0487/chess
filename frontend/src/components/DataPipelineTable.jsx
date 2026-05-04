import React, { useState, useEffect } from 'react';
import { API_BASE } from '../config/api';

const DataPipelineTable = ({
  fen,
  currentMove,
  moveNo,
  player,
  playedMoveStanding,
  bestMovesList,
  prevEval,
  playedMoveEval,
  legalMovesCount,
  bookStatus,
  displayScore,
  winPercent,
  mlInputs,
  mlOutputs,
  mode = 'analysis',
  commentaryInputs,
  behavioralInsights,
  behaviorScores,
}) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!fen) return;
    setIsLoading(true);
    fetch(`${API_BASE}/ai/pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen }),
    })
      .then((res) => res.json())
      .then((json) => {
        setError(null);
        setData(json);
      })
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [fen]);

  const parseCp = (s) => {
    const t = String(s ?? '').trim().toUpperCase();
    if (!t) return null;
    if (t.startsWith('#') || t.startsWith('M')) {
      const val = parseFloat(t.replace('#', '').replace('M', ''));
      return val > 0 ? 10000 : -10000;
    }
    const n = parseFloat(t);
    return Number.isFinite(n) ? n * 100 : null;
  };

  const { tables } = data || {};
  const isInitialPosition = moveNo === 0;
  const loading = isLoading && !tables && !!fen;
  const mlLoading = !!tables && (!mlInputs || !mlOutputs) && !isInitialPosition;

  return (
    <div className="mt-0 w-full bg-white border border-slate-200 rounded-2xl px-6 pb-6 pt-2 shadow-sm min-h-[400px]">
      {loading && (
        <div className="flex justify-end items-center mb-4 min-h-[32px]">
          <div className="flex items-center gap-2 text-emerald-600 text-xs font-bold animate-pulse bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
            <div className="w-2 h-2 bg-emerald-600 rounded-full"></div>
            Analyzing position...
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-100 rounded-lg text-red-600 text-sm">
          <h3 className="font-bold mb-1">Pipeline Error</h3>
          <p>{error}</p>
        </div>
      )}

      {!tables && !loading ? (
        <div className="p-10 text-center text-slate-400 italic">Select a move to see pipeline data</div>
      ) : (
        <div className={loading ? "opacity-50 pointer-events-none transition-opacity duration-200" : "transition-opacity duration-200"}>
          {/* Flan-T5 Enhanced Section */}
          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <span className="text-indigo-600">🤖</span> Flan-T5 Refinement
            </h3>
            <div className="p-6 rounded-xl border-2 border-indigo-100 bg-indigo-50/30 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
              {commentaryInputs?.flan_t5_output ? (
                <p className="text-slate-700 leading-relaxed font-semibold">
                  {commentaryInputs.flan_t5_output}
                </p>
              ) : (
                <div className="flex items-center gap-3 text-slate-400 italic">
                  <div className="animate-pulse w-2 h-2 rounded-full bg-indigo-300"></div>
                  Flan-T5 is processing the commentary...
                </div>
              )}
            </div>
          </div>

          {/* Generated Commentary Section */}
          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <span className="text-emerald-600">✍️</span> Generated Move Commentary
            </h3>
            <div className="p-6 rounded-xl border-2 border-emerald-100 bg-emerald-50/30 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
              {commentaryInputs?.generated_commentary ? (
                <p className="text-slate-700 leading-relaxed font-medium italic">
                  "{commentaryInputs.generated_commentary}"
                </p>
              ) : (
                <div className="flex items-center gap-3 text-slate-400 italic">
                  <div className="animate-pulse w-2 h-2 rounded-full bg-slate-300"></div>
                  Generating commentary based on move data...
                </div>
              )}
            </div>
          </div>

          {/* Commentary Inputs Section - Hidden as requested
          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <span className="text-blue-600">💬</span> Commentary Generation Inputs (JSON)
            </h3>
            ...
          </div>
          */}

          {/* Behavioral Chess Insights Section - Hidden as requested
          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <span className="text-emerald-600">🧠</span> Behavioral Chess Insights
              {mlLoading && (
                <span className="ml-2 text-[10px] font-bold text-indigo-400 animate-pulse uppercase tracking-wider bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                  Analyzing...
                </span>
              )}
            </h3>
            ...
            {behaviorScores && (
              <div className="mt-8 border-t border-slate-100 pt-6">
                ...
              </div>
            )}
          </div>
          */}

          {/* Chess Data Pipeline Metrics - Hidden as requested
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <span className="text-emerald-600">♟</span> Chess Data Pipeline Metrics
            </h2>
          </div>

          <table className="w-full text-left text-sm border-collapse">
            ...
          </table>
          */}

          {/* ML Model Inputs Section - Hidden as requested
          <div className="mt-8">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <span className="text-indigo-600">📊</span> ML Model Inputs
              ...
            </h3>
            <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 transition-all duration-300 ${mlLoading ? 'opacity-70 grayscale-[0.5]' : ''}`}>
              ...
            </div>
          </div>
          */}
        </div>
      )}
    </div>
  );
};

export default DataPipelineTable;
