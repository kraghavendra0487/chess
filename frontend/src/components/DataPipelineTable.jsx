import React, { useState, useEffect, useCallback } from 'react';
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
  analysisProgress,
}) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const getScoreColor = (score) => {
    const s = parseFloat(score);
    if (isNaN(s)) return 'bg-slate-500';
    if (s >= 80) return 'bg-emerald-500';
    if (s >= 60) return 'bg-lime-500';
    if (s >= 40) return 'bg-yellow-500';
    if (s >= 20) return 'bg-orange-500';
    return 'bg-rose-500';
  };

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

  const [stories, setStories] = React.useState(null);
  const [isStoryLoading, setIsStoryLoading] = React.useState(false);
  const storyFetchedRef = React.useRef(false);
  const [speakingText, setSpeakingText] = useState(null);

  const speak = (text) => {
    if (!window.speechSynthesis) return;
    
    // If already speaking the same text, stop it
    if (speakingText === text) {
      window.speechSynthesis.cancel();
      setSpeakingText(null);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setSpeakingText(null);
    utterance.onerror = () => setSpeakingText(null);
    
    setSpeakingText(text);
    window.speechSynthesis.speak(utterance);
  };

  // Reset the fetch flag when analysis is not at 100% (e.g. new game started)
  useEffect(() => {
    if (analysisProgress < 100) {
      storyFetchedRef.current = false;
      setStories(null);
    }
  }, [analysisProgress]);

  const fetchStories = React.useCallback(async (scores) => {
    if (storyFetchedRef.current) return;
    storyFetchedRef.current = true;

    setIsStoryLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/behavior/stories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scores)
      });
      if (res.ok) {
        const data = await res.json();
        setStories(data.stories || []);
      }
    } catch (e) {
      console.error('Failed to fetch stories', e);
      storyFetchedRef.current = false; // Allow retry on failure
    } finally {
      setIsStoryLoading(false);
    }
  }, []);

  // Trigger story fetch when behavior scores are updated AND analysis is 100% complete
  useEffect(() => {
    if (behaviorScores && analysisProgress === 100 && !storyFetchedRef.current) {
      // Invert scores (100 - score) to find stories about what we lack
      // For all behaviors, including Aggression, we send 100-n to identify the gaps
      const lackScores = {};
      Object.keys(behaviorScores).forEach(key => {
        const score = parseFloat(behaviorScores[key]);
        if (!isNaN(score)) {
          lackScores[key] = 100 - score;
        } else {
          lackScores[key] = behaviorScores[key];
        }
      });
      fetchStories(lackScores);
    }
  }, [behaviorScores, analysisProgress, fetchStories]);

  return (
    <div className="flex flex-col gap-6">
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
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <span className="text-indigo-600">🤖</span> Flan-T5 Refinement
              </h3>
              {commentaryInputs?.flan_t5_output && (
                <button 
                  onClick={() => speak(commentaryInputs.flan_t5_output)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${speakingText === commentaryInputs.flan_t5_output ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-indigo-100 text-indigo-600 hover:bg-indigo-50'}`}
                  title={speakingText === commentaryInputs.flan_t5_output ? "Stop Speaking" : "Listen to Refinement"}
                >
                  <span className="text-sm">{speakingText === commentaryInputs.flan_t5_output ? '⏹' : '🔊'}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider">{speakingText === commentaryInputs.flan_t5_output ? 'Stop' : 'Listen'}</span>
                </button>
              )}
            </div>
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
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <span className="text-emerald-600">✍️</span> Generated Move Commentary
              </h3>
              {commentaryInputs?.generated_commentary && (
                <button 
                  onClick={() => speak(commentaryInputs.generated_commentary)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${speakingText === commentaryInputs.generated_commentary ? 'bg-emerald-600 border-emerald-600 text-white shadow-md' : 'bg-white border-emerald-100 text-emerald-600 hover:bg-emerald-50'}`}
                  title={speakingText === commentaryInputs.generated_commentary ? "Stop Speaking" : "Listen to Commentary"}
                >
                  <span className="text-sm">{speakingText === commentaryInputs.generated_commentary ? '⏹' : '🔊'}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider">{speakingText === commentaryInputs.generated_commentary ? 'Stop' : 'Listen'}</span>
                </button>
              )}
            </div>
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
            <div className="p-6 rounded-xl border-2 border-emerald-100 bg-emerald-50/30 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
              {behaviorScores ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-white p-3 rounded-lg border border-emerald-100 shadow-sm">
                      <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Patience</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full transition-all duration-500 ${getScoreColor(behaviorScores.Patience)}`} style={{ width: `${behaviorScores.Patience || 0}%` }}></div>
                        </div>
                        <span className="text-xs font-bold text-slate-700">{behaviorScores.Patience || 0}%</span>
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-emerald-100 shadow-sm">
                      <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Consistency</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full transition-all duration-500 ${getScoreColor(behaviorScores.Consistency)}`} style={{ width: `${behaviorScores.Consistency || 0}%` }}></div>
                        </div>
                        <span className="text-xs font-bold text-slate-700">{behaviorScores.Consistency || 0}%</span>
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-emerald-100 shadow-sm">
                      <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Adaptability</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full transition-all duration-500 ${getScoreColor(behaviorScores.Adaptability)}`} style={{ width: `${behaviorScores.Adaptability || 0}%` }}></div>
                        </div>
                        <span className="text-xs font-bold text-slate-700">{behaviorScores.Adaptability || 0}%</span>
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-emerald-100 shadow-sm">
                      <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Focus</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full transition-all duration-500 ${getScoreColor(behaviorScores.Focus)}`} style={{ width: `${behaviorScores.Focus || 0}%` }}></div>
                        </div>
                        <span className="text-xs font-bold text-slate-700">{behaviorScores.Focus || 0}%</span>
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-emerald-100 shadow-sm">
                      <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Mental Stability</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full transition-all duration-500 ${getScoreColor(behaviorScores.MentalStability)}`} style={{ width: `${behaviorScores.MentalStability || 0}%` }}></div>
                        </div>
                        <span className="text-xs font-bold text-slate-700">{behaviorScores.MentalStability || 0}%</span>
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-emerald-100 shadow-sm">
                      <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Time Management</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full transition-all duration-500 ${getScoreColor(behaviorScores.TimeManagement)}`} style={{ width: `${behaviorScores.TimeManagement || 0}%` }}></div>
                        </div>
                        <span className="text-xs font-bold text-slate-700">{behaviorScores.TimeManagement || 0}%</span>
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-emerald-100 shadow-sm">
                      <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Creativity</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full transition-all duration-500 ${getScoreColor(behaviorScores.Creativity)}`} style={{ width: `${behaviorScores.Creativity || 0}%` }}></div>
                        </div>
                        <span className="text-xs font-bold text-slate-700">{behaviorScores.Creativity || 0}%</span>
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-emerald-100 shadow-sm">
                      <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Aggression</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full transition-all duration-500 ${getScoreColor(behaviorScores.Aggression)}`} style={{ width: `${behaviorScores.Aggression || 0}%` }}></div>
                        </div>
                        <span className="text-xs font-bold text-slate-700">{behaviorScores.Aggression || 0}%</span>
                      </div>
                    </div>
                  </div>
                  {behavioralInsights && (
                    <p className="text-slate-500 text-[11px] font-medium border-t border-emerald-100 pt-4">
                      Current Context: <span className="text-slate-700 font-bold">Move {behavioralInsights.moveNumber}</span> | 
                      Time: <span className="text-slate-700 font-bold">{behavioralInsights.moveTime}</span> | 
                      Phase: <span className="text-slate-700 font-bold uppercase tracking-wider">{behavioralInsights.gamePhase}</span>
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3 text-slate-400 italic">
                  <div className="animate-pulse w-2 h-2 rounded-full bg-emerald-300"></div>
                  Analyzing 8 behavioral dimensions...
                </div>
              )}
            </div>
          </div>

          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <span className="text-amber-600">📖</span> Recommended Stories
              {isStoryLoading && (
                <span className="ml-2 text-[10px] font-bold text-amber-500 animate-pulse uppercase tracking-wider bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                  Finding matches...
                </span>
              )}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {stories && stories.length > 0 ? (
                stories.map((story, idx) => (
                  <div key={idx} className="p-4 rounded-xl border-2 border-amber-100 bg-amber-50/30 shadow-sm relative overflow-hidden group hover:border-amber-200 transition-all flex flex-col h-full">
                    <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
                    <div className="flex flex-col gap-2 h-full">
                      <h4 className="text-sm font-bold text-slate-900 group-hover:text-amber-700 transition-colors line-clamp-1">
                        {idx + 1}. {story.title}
                      </h4>
                      <div className="flex flex-col gap-1 mt-auto">
                        <span className="text-amber-600 font-bold text-[10px] uppercase tracking-wider shrink-0">Moral</span>
                        <p className="text-slate-600 text-xs leading-relaxed italic line-clamp-2">
                          "{story.moral}"
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ) : isStoryLoading ? (
                <div className="p-6 rounded-xl border-2 border-amber-100 bg-amber-50/30 shadow-sm">
                  <div className="flex flex-col items-center justify-center h-full py-4 gap-3">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                    <span className="text-slate-400 font-medium italic text-sm">Loading recommended stories...</span>
                  </div>
                </div>
              ) : (
                <div className="p-6 rounded-xl border-2 border-amber-100 bg-amber-50/30 shadow-sm">
                  <div className="flex items-center justify-center h-full py-4">
                    <span className="text-slate-400 font-medium italic">Complete the analysis to see your stories...</span>
                  </div>
                </div>
              )}
            </div>
          </div>

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
