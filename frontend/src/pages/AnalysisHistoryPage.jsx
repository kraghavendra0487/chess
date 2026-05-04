import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../config/api';
import { downloadSessionAnalysisExcel } from '../utils/exportSessionAnalysisExcel';

const statusStyle = (status) => {
  const s = String(status || '').toLowerCase();
  if (s === 'completed') return 'bg-emerald-100 text-emerald-800';
  if (s === 'failed') return 'bg-red-100 text-red-800';
  if (s === 'analyzing') return 'bg-amber-100 text-amber-900';
  return 'bg-slate-100 text-slate-700';
};

export default function AnalysisHistoryPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [movesPreview, setMovesPreview] = useState({});
  const [exportingId, setExportingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/sessions?limit=100`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (e) {
      setError(e?.message || String(e));
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleMoves = async (id) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (movesPreview[id]) return;
    try {
      const res = await fetch(`${API_BASE}/api/sessions/${id}/moves`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMovesPreview((prev) => ({ ...prev, [id]: data.moves || [] }));
    } catch (e) {
      setMovesPreview((prev) => ({ ...prev, [id]: [] }));
    }
  };

  const removeSession = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this saved session and all move rows?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/sessions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      setExpandedId((x) => (x === id ? null : x));
    } catch (err) {
      alert(err?.message || 'Delete failed');
    }
  };

  const openInAnalyze = (id, e) => {
    e.stopPropagation();
    navigate(`/analyze?session=${id}`);
  };

  const exportSession = async (id, e) => {
    e.stopPropagation();
    setExportingId(id);
    try {
      const res = await fetch(`${API_BASE}/api/sessions/${id}/moves`);
      if (!res.ok) throw new Error(`Could not load moves (${res.status})`);
      const data = await res.json();
      const moves = data.moves || [];
      if (moves.length === 0) {
        alert('No move rows saved for this session yet.');
        return;
      }
      downloadSessionAnalysisExcel(id, moves);
    } catch (err) {
      alert(err?.message || 'Export failed');
    } finally {
      setExportingId(null);
    }
  };

  return (
    <div className="px-4 pt-4 pb-6 sm:p-6 sm:pb-8 lg:p-8 max-w-6xl mx-auto w-full min-h-0">
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-start sm:justify-between gap-4 mb-6 sm:mb-8">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Analysis history</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
            Games saved when you load a PGN on Analyze; each analyzed position is stored as a row. Each entry shows{' '}
            <span className="text-slate-600 font-medium">SL No.</span> (list order),{' '}
            <span className="text-slate-600 font-medium">session id</span>, and the stored{' '}
            <span className="text-slate-600 font-medium">PGN</span>.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="w-full sm:w-auto shrink-0 px-4 py-3 sm:py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 shadow-sm touch-manipulation min-h-[44px] sm:min-h-0"
        >
          Refresh
        </button>
      </div>

      {loading && (
        <p className="text-slate-500 text-sm">Loading…</p>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm p-4 mb-4">
          <strong className="font-semibold">Could not reach the API.</strong>{' '}
          {error} — start the backend (<code className="bg-red-100 px-1 rounded">npm start</code> in{' '}
          <code className="bg-red-100 px-1 rounded">backend</code>) and ensure{' '}
          <code className="bg-red-100 px-1 rounded">{API_BASE}</code> is correct (optional{' '}
          <code className="bg-red-100 px-1 rounded">VITE_API_URL</code> in{' '}
          <code className="bg-red-100 px-1 rounded">.env</code>).
        </div>
      )}

      {!loading && !error && sessions.length === 0 && (
        <p className="text-slate-500 text-sm">No saved sessions yet. Load a PGN on the Analyze page to create one.</p>
      )}

      <div className="space-y-3">
        {sessions.map((s, index) => {
          const slNo = index + 1;
          const pgnText = typeof s.pgn_text === 'string' ? s.pgn_text.trim() : '';
          return (
          <div
            key={s.id}
            className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
          >
            <button
              type="button"
              className="w-full text-left px-4 sm:px-5 py-3 sm:py-4 flex flex-wrap items-center gap-2 sm:gap-3 hover:bg-slate-50/80 transition touch-manipulation"
              onClick={() => toggleMoves(s.id)}
            >
              <span className="shrink-0 w-9 text-center font-mono text-xs font-bold text-indigo-600 tabular-nums" title="Serial no. (list order)">
                {slNo}
              </span>
              <span className="font-mono text-xs text-slate-400 w-12 shrink-0" title="Database session id">
                #{s.id}
              </span>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md shrink-0 ${statusStyle(s.status)}`}>
                {s.status}
              </span>
              <span className="text-sm text-slate-800 font-medium truncate flex-1 min-w-[120px]">
                {s.input_filename || s.input_source || 'PGN import'}
              </span>
              <span className="text-xs text-slate-500 shrink-0">
                {s.move_rows_saved ?? 0} / {s.progress_total ?? '—'} rows
              </span>
              <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
                {s.created_at}
              </span>
              <i className={`fas fa-chevron-${expandedId === s.id ? 'up' : 'down'} text-slate-300 text-xs shrink-0`} />
            </button>
            <div className="px-4 sm:px-5 pb-3">
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1.5">PGN</p>
              {pgnText ? (
                <pre className="text-[10px] sm:text-[11px] leading-relaxed font-mono text-slate-700 bg-slate-50 border border-slate-100 rounded-xl p-3 max-h-36 sm:max-h-40 overflow-auto whitespace-pre-wrap break-words">
                  {pgnText}
                </pre>
              ) : (
                <p className="text-xs text-slate-400 italic">No PGN text stored for this session.</p>
              )}
            </div>
            <div className="px-4 sm:px-5 pb-3 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 border-t border-slate-100 bg-slate-50/50 pt-3">
              <button
                type="button"
                className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-3 sm:py-2 rounded-xl shadow-sm touch-manipulation min-h-[44px] sm:min-h-0 flex-1 sm:flex-none"
                onClick={(e) => openInAnalyze(s.id, e)}
              >
                View in Analyze
              </button>
              <button
                type="button"
                disabled={exportingId === s.id}
                className="text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 px-3 py-3 sm:py-2 rounded-xl disabled:opacity-50 touch-manipulation min-h-[44px] sm:min-h-0 flex-1 sm:flex-none"
                onClick={(e) => exportSession(s.id, e)}
              >
                {exportingId === s.id ? 'Exporting…' : 'Export Excel'}
              </button>
              <button
                type="button"
                className="text-xs font-bold text-red-600 hover:text-red-800 px-3 py-3 sm:py-2 rounded-xl hover:bg-red-50 touch-manipulation min-h-[44px] sm:min-h-0 sm:ml-auto"
                onClick={(e) => removeSession(s.id, e)}
              >
                Delete
              </button>
            </div>
            {expandedId === s.id && (
              <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/30 max-h-[420px] overflow-auto">
                <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-2">Move rows (preview)</p>
                {(movesPreview[s.id] || []).length === 0 ? (
                  <p className="text-xs text-slate-500">No rows yet or still loading…</p>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="text-slate-500 border-b border-slate-200">
                        <th className="py-2 pr-3 font-semibold">Ply</th>
                        <th className="py-2 pr-3 font-semibold">SAN</th>
                        <th className="py-2 pr-3 font-semibold">Eval</th>
                        <th className="py-2 font-semibold">Phase</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(movesPreview[s.id] || []).map((m) => (
                        <tr key={m.ply_index} className="border-b border-slate-100">
                          <td className="py-1.5 pr-3 font-mono">{m.ply_index}</td>
                          <td className="py-1.5 pr-3">{m.san_move}</td>
                          <td className="py-1.5 pr-3 font-mono truncate max-w-[120px]">{m.played_move_eval}</td>
                          <td className="py-1.5 text-slate-600">{m.game_phase}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
