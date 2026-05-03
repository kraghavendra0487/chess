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

          {/* Commentary Inputs Section */}
          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <span className="text-blue-600">💬</span> Commentary Generation Inputs (JSON)
            </h3>
            
            <div className="rounded-xl border border-slate-200 bg-slate-900 shadow-lg transition-all duration-300 min-h-[200px] overflow-hidden">
              {commentaryInputs ? (
                <div className="p-6 font-mono text-xs leading-relaxed overflow-x-auto">
                  <pre className="text-blue-400">
                     {JSON.stringify({
                      move: commentaryInputs.move,
                      english_move: commentaryInputs.english_move,
                      turn: commentaryInputs.turn,
                      classification: commentaryInputs.classification,
                      book_move_name: commentaryInputs.book_move_name,
                      played_eval: commentaryInputs.played_eval,
                      eval_before: commentaryInputs.eval_before,
                      best_engine: commentaryInputs.best_engine,
                      best_eval: commentaryInputs.best_eval,
                      top_3_next_moves: commentaryInputs.top_3_next_moves,
                      game_phase: commentaryInputs.game_phase,
                      tactical_classification: commentaryInputs.tactical_classification,
                      king_safety: commentaryInputs.king_safety,
                      space_dominance: commentaryInputs.space_dominance,
                      mobility: commentaryInputs.mobility
                    }, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center space-y-4 max-w-md">
                  <div className="w-16 h-16 rounded-full bg-white border border-slate-100 flex items-center justify-center text-blue-500 shadow-sm">
                    <i className="fas fa-comment-dots text-2xl"></i>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-bold text-slate-700">Awaiting Commentary Data</p>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Detailed move commentary and strategic inputs will appear here as they are generated.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Behavioral Chess Insights Section */}
          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <span className="text-emerald-600">🧠</span> Behavioral Chess Insights
              {mlLoading && (
                <span className="ml-2 text-[10px] font-bold text-indigo-400 animate-pulse uppercase tracking-wider bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                  Analyzing...
                </span>
              )}
            </h3>
            <div className={`overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/30 shadow-sm transition-all duration-300 min-h-[160px] flex items-center justify-center ${mlLoading ? 'opacity-70 grayscale-[0.5]' : ''}`}>
              {behavioralInsights ? (
                <div className="w-full p-6 grid grid-cols-2 sm:grid-cols-4 gap-6">
                  <div className="flex flex-col items-center text-center">
                    <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Move Time (Tᵢ)</span>
                    <span className="text-xl font-mono font-bold text-emerald-600">{behavioralInsights.moveTime}</span>
                  </div>
                  <div className="flex flex-col items-center text-center">
                    <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Top Line Eval (Eᵢᵗᵒᵖ)</span>
                    <span className="text-xl font-mono font-bold text-indigo-600">{behavioralInsights.topLineEval}</span>
                  </div>
                  <div className="flex flex-col items-center text-center">
                    <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Played Move Eval (Eᵢᵖˡᵃʸ)</span>
                    <span className="text-xl font-mono font-bold text-slate-800">{behavioralInsights.playedMoveEval}</span>
                  </div>
                  <div className="flex flex-col items-center text-center">
                    <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Classification (Cᵢ)</span>
                    <span className={`text-sm font-bold px-3 py-1 rounded-full border ${
                      behavioralInsights.classification.toLowerCase() === 'best' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                      behavioralInsights.classification.toLowerCase() === 'excellent' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                      behavioralInsights.classification.toLowerCase() === 'good' ? 'bg-green-50 text-green-700 border-green-100' :
                      behavioralInsights.classification.toLowerCase() === 'inaccuracy' ? 'bg-yellow-50 text-yellow-700 border-yellow-100' :
                      behavioralInsights.classification.toLowerCase() === 'mistake' ? 'bg-orange-50 text-orange-700 border-orange-100' :
                      behavioralInsights.classification.toLowerCase() === 'blunder' ? 'bg-rose-50 text-rose-700 border-rose-100' :
                      'bg-slate-50 text-slate-700 border-slate-100'
                    }`}>
                      {behavioralInsights.classification}
                    </span>
                  </div>
                  <div className="flex flex-col items-center text-center">
                    <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Move Number (mᵢ)</span>
                    <span className="text-xl font-mono font-bold text-slate-800">{behavioralInsights.moveNumber}</span>
                  </div>
                  <div className="flex flex-col items-center text-center">
                    <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Game Phase (Pᵢ)</span>
                    <span className="text-sm font-bold text-slate-700 uppercase">{behavioralInsights.gamePhase}</span>
                  </div>
                  <div className="flex flex-col items-center text-center">
                    <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Move Standing (Sᵢ)</span>
                    <span className="text-xl font-mono font-bold text-amber-600">{behavioralInsights.moveStanding}</span>
                  </div>
                  <div className="flex flex-col items-center text-center">
                    <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Time Control</span>
                    <span className="text-sm font-bold text-slate-700">{behavioralInsights.timeControl}</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center space-y-4 max-w-md">
                  <div className="w-16 h-16 rounded-full bg-white border border-slate-100 flex items-center justify-center text-emerald-500 shadow-sm">
                    <i className="fas fa-lightbulb text-2xl"></i>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-bold text-slate-700">Awaiting Behavioral Patterns</p>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Once enough moves are analyzed, we'll reveal psychological patterns, playstyle tendencies, and behavioral chess insights here.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Behavioral Traits Section */}
            {behaviorScores && (
              <div className="mt-8 border-t border-slate-100 pt-6">
                <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                  <span className="text-emerald-500 text-xs">●</span> Psychological Traits & Behavioral Patterns
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {Object.entries(behaviorScores).map(([trait, score]) => (
                    <div key={trait} className="bg-white border border-slate-100 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow duration-300">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{trait}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          score >= 80 ? 'bg-emerald-50 text-emerald-600' :
                          score >= 60 ? 'bg-blue-50 text-blue-600' :
                          score >= 40 ? 'bg-yellow-50 text-yellow-600' :
                          'bg-rose-50 text-rose-600'
                        }`}>
                          {score}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-1000 ${
                            score >= 80 ? 'bg-emerald-500' :
                            score >= 60 ? 'bg-blue-500' :
                            score >= 40 ? 'bg-yellow-500' :
                            'bg-rose-500'
                          }`}
                          style={{ width: `${score}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <span className="text-emerald-600">♟</span> Chess Data Pipeline Metrics
            </h2>
          </div>

          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                <th className="py-3 px-4">Metric</th>
                <th className="py-3 px-4">Value / Extraction</th>
              </tr>
            </thead>
            <tbody className="text-slate-700 divide-y divide-slate-100">
              {tables ? (
                <>
                  <tr className="bg-emerald-50/30">
                    <td className="py-3 px-4 font-bold text-emerald-700">Move Played</td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{currentMove ? currentMove.san : 'Starting Position'}</td>
                  </tr>
                  <tr className="bg-emerald-50/30">
                    <td className="py-3 px-4 font-bold text-emerald-700">Opening Book</td>
                    <td className="py-3 px-4">
                      {bookStatus?.isBook ? (
                        <span className="font-bold text-emerald-700">Book Move: {bookStatus.opening?.name}</span>
                      ) : (
                        <span className="text-rose-700">Out of Book</span>
                      )}
                    </td>
                  </tr>
                  <tr className="bg-emerald-50/30">
                    <td className="py-3 px-4 font-bold text-emerald-700">Played Eval</td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{playedMoveEval || displayScore?.text || '0.00'}</td>
                  </tr>
                  <tr className="bg-emerald-50/30">
                    <td className="py-3 px-4 font-bold text-emerald-700">Prev Eval</td>
                    <td className="py-3 px-4 font-mono text-slate-500">{prevEval || '0.00'}</td>
                  </tr>
                  <tr className="bg-emerald-50/30">
                    <td className="py-3 px-4 font-bold text-emerald-700">Delta</td>
                    <td className="py-3 px-4 font-mono font-bold">
                      {(() => {
                        const current = parseFloat(playedMoveEval || displayScore?.text || "0.00");
                        const prev = parseFloat(prevEval || "0.00");
                        const diff = (current - prev).toFixed(2);
                        const isPos = parseFloat(diff) >= 0;
                        return <span className={isPos ? 'text-emerald-600' : 'text-rose-600'}>{isPos ? '+' : ''}{diff}</span>;
                      })()}
                    </td>
                  </tr>
                  <tr className="bg-emerald-50/30">
                    <td className="py-3 px-4 font-bold text-emerald-700">Win Probability</td>
                    <td className="py-3 px-4 font-mono font-bold">{winPercent?.toFixed(1)}%</td>
                  </tr>
                  
                  <tr>
                    <td className="py-3 px-4 font-medium text-emerald-600">Game Phase</td>
                    <td className="py-3 px-4">{tables?.t1?.derived?.game_phase || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium text-emerald-600">Spatial Dominance</td>
                    <td className="py-3 px-4">W: {tables?.t2?.spatial_dominance?.white ?? 0}, B: {tables?.t2?.spatial_dominance?.black ?? 0}</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium text-emerald-600">King Safety</td>
                    <td className="py-3 px-4">W Intensity: {tables?.t5?.white?.attack_intensity ?? 0}, B Intensity: {tables?.t5?.black?.attack_intensity ?? 0}</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium text-emerald-600">Strategic Synthesis</td>
                    <td className="py-3 px-4">{tables?.t16?.overall || 'N/A'}</td>
                  </tr>
                </>
              ) : (
                // Skeleton for main metrics table
                Array.from({ length: 11 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-3 px-4">
                      <div className={`h-4 bg-slate-100 rounded ${i < 6 ? 'w-24' : 'w-32'}`}></div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="h-4 w-16 bg-slate-50 rounded"></div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* ML Model Inputs Section */}
          <div className="mt-8">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <span className="text-indigo-600">📊</span> ML Model Inputs
              {mlLoading && (
                <span className="ml-2 text-[10px] font-bold text-indigo-400 animate-pulse uppercase tracking-wider bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                  Calculating...
                </span>
              )}
            </h3>
            <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 transition-all duration-300 ${mlLoading ? 'opacity-70 grayscale-[0.5]' : ''}`}>
              {mlInputs && !mlInputs.error ? (
                Object.entries(mlInputs).map(([key, val]) => (
                  <div key={key} className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">{key}</span>
                    <span className="text-sm font-mono font-bold text-slate-700">{typeof val === 'number' ? val.toFixed(2) : val}</span>
                  </div>
                ))
              ) : mlInputs?.error ? (
                <div className="col-span-full text-center text-rose-500 font-medium italic py-4">
                  Error calculating inputs: {mlInputs.error}
                </div>
              ) : mlLoading ? (
                // Skeleton Loader for Inputs
                Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex flex-col animate-pulse">
                    <div className="h-2 w-16 bg-slate-200 rounded mb-2"></div>
                    <div className="h-4 w-10 bg-slate-200 rounded"></div>
                   </div>
                 ))
               ) : isInitialPosition ? (
                 <div className="col-span-full text-center text-indigo-400 font-medium italic py-4">
                   Model inputs are available once the game begins.
                 </div>
               ) : (
                 <div className="col-span-full text-center text-slate-400 italic py-4">No input data available</div>
               )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataPipelineTable;
