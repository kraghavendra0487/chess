import React, { useCallback, useEffect, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Chess } from 'chess.js';
import { useSearchParams } from 'react-router-dom';
import { useChessGame, countLegalMovesAtPly } from './hooks/useChessGame';
import { API_BASE } from './config/api';
import { ANALYSIS_ROW_CELL_KEYS } from './utils/analysisDbRowKeys';
import { EXPORT_HEADERS } from './utils/analysisExportHeaders';
import Header from './components/Header';
import LeftSidebar from './components/LeftSidebar';
import RightSidebar from './components/RightSidebar';
import GameControls from './components/GameControls';
import EvaluationBar from './components/EvaluationBar';
import PlayerBadge from './components/PlayerBadge';
import DataPipelineTable from './components/DataPipelineTable';
import { Chessboard } from 'react-chessboard';
import { getPlayedMoveClassAndStandingAtNavIndex } from './utils/playedMoveClassification';
import { ensurePipelineSlotsForExport } from './utils/ensurePipelineForExport';

const AnalyzePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionQuery = searchParams.get('session');
  const {
    position,
    selected,
    targets,
    turn,
    history,
    timeline,
    navIndex,
    setNavIndex,
    whiteAI,
    setWhiteAI,
    blackAI,
    setBlackAI,
    orientation,
    setOrientation,
    analysis,
    boardWidth,
    boardContainerRef,
    onSquareClick,
    onPieceDrop,
    resetBoard,
    loadPGN,
    evalPercent,
    displayScore,
    currentTurn,
    currentFEN,
    fenAtMove,
    currentMove,
    bestMove,
    winPercent,
    bestMovesList,
    prevEval,
    playedMoveEval,
    legalMovesCount,
    bookStatusByPly,
    firstNonBookPly,
    analysisProgress,
    pipelineData,
    mlInputs,
    mlOutputs,
    mergePipelineDataAtIndex,
    mergePipelineSlots,
    analysisSessionId,
    restoreSessionFromDb,
    moveClassifications,
    multipv,
    pgnMetadata,
  } = useChessGame({ multipv: 3 });

  const [enhancedCommentaries, setEnhancedCommentaries] = React.useState({});
  const [enhancedCommentaryPending, setEnhancedCommentaryPending] = React.useState({});
  const [flanT5Outputs, setFlanT5Outputs] = React.useState({});
  const [flanT5Pending, setFlanT5Pending] = React.useState({}); // Track pending requests
  const [allMoveInputs, setAllMoveInputs] = React.useState([]);

  const whitePlayer = pgnMetadata?.White;
  const whiteRating = pgnMetadata?.WhiteElo;
  const blackPlayer = pgnMetadata?.Black;
  const blackRating = pgnMetadata?.BlackElo;

  // Find clock for the player whose turn it JUST WAS (the move that just happened)
  // or the player whose turn it IS (if we want to show their last known clock).
  // Standard is to show last known clock for both.
  
  const getLatestClock = (color) => {
    for (let i = navIndex - 1; i >= 0; i--) {
      if (history[i]?.color === color && history[i]?.clock) {
        return history[i].clock;
      }
    }
    return null;
  };

  const topPlayer = orientation === 'white' 
    ? { name: blackPlayer || 'Black', rating: blackRating, color: 'b', clock: getLatestClock('b') } 
    : { name: whitePlayer || 'White', rating: whiteRating, color: 'w', clock: getLatestClock('w') };
  
  const bottomPlayer = orientation === 'white' 
    ? { name: whitePlayer || 'White', rating: whiteRating, color: 'w', clock: getLatestClock('w') } 
    : { name: blackPlayer || 'Black', rating: blackRating, color: 'b', clock: getLatestClock('b') };

  useEffect(() => {
    if (!sessionQuery) return undefined;
    const sid = Number(sessionQuery);
    if (!Number.isFinite(sid)) return undefined;
    let cancelled = false;
    restoreSessionFromDb(sid).then((ok) => {
      if (cancelled || !ok) return;
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('session');
          return next;
        },
        { replace: true }
      );
    });
    return () => {
      cancelled = true;
    };
  }, [sessionQuery, restoreSessionFromDb, setSearchParams]);

  useEffect(() => {
    const input = allMoveInputs[navIndex];
    if (!input || enhancedCommentaries[navIndex] || enhancedCommentaryPending[navIndex]) return;

    const fetchEnhancedCommentary = async () => {
      setEnhancedCommentaryPending(prev => ({ ...prev, [navIndex]: true }));
      try {
        const res = await fetch(`${API_BASE}/api/nlp/commentary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        if (res.ok) {
          const data = await res.json();
          setEnhancedCommentaries((prev) => ({
            ...prev,
            [navIndex]: data.commentary,
          }));
        }
      } catch (err) {
        console.warn('Failed to fetch enhanced commentary', err);
      } finally {
        setEnhancedCommentaryPending(prev => ({ ...prev, [navIndex]: false }));
      }
    };

    fetchEnhancedCommentary();
  }, [navIndex, allMoveInputs, enhancedCommentaries, enhancedCommentaryPending]);

  useEffect(() => {
    const commentary = enhancedCommentaries[navIndex] || allMoveInputs[navIndex]?.generated_commentary;
    if (!commentary || flanT5Outputs[navIndex] || flanT5Pending[navIndex]) return;

    const fetchFlanT5 = async () => {
      setFlanT5Pending(prev => ({ ...prev, [navIndex]: true }));
      try {
        const moveInput = allMoveInputs[navIndex];
        const res = await fetch(`${API_BASE}/api/flan-t5/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            text: commentary,
            classification: moveInput?.classification || 'good',
            tactical: moveInput?.tactical_classification || 'NONE',
            turn: moveInput?.turn || 'Opponent',
            book_move_name: moveInput?.book_move_name || 'N/A'
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setFlanT5Outputs((prev) => ({
              ...prev,
              [navIndex]: data.output,
            }));
          }
        }
      } catch (err) {
        console.warn('Failed to fetch Flan-T5 output', err);
      } finally {
        setFlanT5Pending(prev => ({ ...prev, [navIndex]: false }));
      }
    };

    fetchFlanT5();
  }, [navIndex, enhancedCommentaries, allMoveInputs, flanT5Outputs, flanT5Pending]);

  const mateDistanceToClassificationScore = useCallback((mateDistance) => {
    if (!Number.isFinite(mateDistance)) return 999;
    const normalized = Math.max(1, Math.abs(Math.trunc(mateDistance)));
    if (normalized <= 10) return (11 - normalized) * 1000;
    return 999;
  }, []);

  const normalizeScoreObject = useCallback((scoreObj) => {
    if (!scoreObj) return null;
    const rawType = String(scoreObj.type || '').toLowerCase();
    if (rawType !== 'cp' && rawType !== 'mate') return null;
    const numericValue = Number(scoreObj.value);
    if (!Number.isFinite(numericValue)) return null;
    return { type: rawType, value: numericValue };
  }, []);

  const toClassificationWhiteEval = useCallback((scoreObj, turnForScore) => {
    const normalizedScore = normalizeScoreObject(scoreObj);
    if (!normalizedScore) return null;
    if (normalizedScore.type === 'cp') {
      let pawns = normalizedScore.value / 100;
      if (turnForScore === 'b') pawns = -pawns;
      return pawns;
    }
    if (normalizedScore.type === 'mate') {
      const sign = Math.sign(normalizedScore.value);
      if (sign === 0) return 0;
      const mapped = mateDistanceToClassificationScore(normalizedScore.value);
      const whiteSigned = turnForScore === 'b' ? -sign : sign;
      return whiteSigned * mapped;
    }
    return null;
  }, [mateDistanceToClassificationScore, normalizeScoreObject]);

  const formatRawEngineScore = useCallback((pick, lineTurn) => {
    if (!pick || !Number.isFinite(Number(pick.value))) return null;
    const t = String(pick.type || '').toLowerCase();
    if (t !== 'cp' && t !== 'mate') return null;
    let val = t === 'cp' ? Number(pick.value) / 100 : Number(pick.value);
    if (lineTurn === 'b') val = -val;
    return t === 'mate' ? `#${val}` : (val >= 0 ? '+' : '') + val.toFixed(2);
  }, []);

  const formatLineScoreForExport = useCallback((line, lineTurn) => {
    const normalizedScore = normalizeScoreObject(line?.score) || normalizeScoreObject(line?.firstMoveScore);
    if (normalizedScore) {
      let val = normalizedScore.type === 'cp' ? normalizedScore.value / 100 : normalizedScore.value;
      if (lineTurn === 'b') val = -val;
      return normalizedScore.type === 'mate' ? `#${val}` : (val >= 0 ? '+' : '') + val.toFixed(2);
    }
    if (line?.firstMoveScore) {
      const s = formatRawEngineScore(line.firstMoveScore, lineTurn);
      if (s) return s;
    }
    if (line?.score) {
      const s = formatRawEngineScore(line.score, lineTurn);
      if (s) return s;
    }
    return 'N/A';
  }, [formatRawEngineScore, normalizeScoreObject]);

  const getEnglishMoveDescription = useCallback((san, turnColor, timelineIdx) => {
    if (!san || san === 'Starting Position') return 'None';
    if (san === 'O-O') return turnColor === 'White' ? 'White castled kingside' : 'Black castled kingside';
    if (san === 'O-O-O') return turnColor === 'White' ? 'White castled queenside' : 'Black castled queenside';

    const PIECE_NAMES = {
      'P': 'pawn', 'N': 'knight', 'B': 'bishop', 'R': 'rook', 'Q': 'queen', 'K': 'king'
    };

    let moveDesc = '';
    let piece = 'pawn';
    let targetSquare = '';
    let isCapture = san.includes('x');
    
    // Extract piece type
    if (['N', 'B', 'R', 'Q', 'K'].includes(san[0])) {
      piece = PIECE_NAMES[san[0]];
    }

    // Extract target square (last two chars, ignoring checks/mates)
    const cleanSan = san.replace(/[+#]/g, '');
    targetSquare = cleanSan.slice(-2);

    if (isCapture) {
      // For pawn captures (e.g., exd5), we can extract the capturing file
      if (piece === 'pawn' && san[1] === 'x') {
        moveDesc = `pawn on ${san[0]} file takes on ${targetSquare}`;
      } else {
        moveDesc = `${piece} takes on ${targetSquare}`;
      }
    } else {
      moveDesc = `${piece} to ${targetSquare}`;
    }

    if (san.includes('+')) moveDesc += ' (with check)';
    if (san.includes('#')) moveDesc += ' (with checkmate)';

    return moveDesc;
  }, []);

  const getLineClassificationWhiteEval = useCallback((line, lineTurn) => {
    if (!line || !lineTurn) return null;
    const direct = line.classificationWhiteEval;
    if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
    if (direct != null && direct !== '' && Number.isFinite(Number(direct))) return Number(direct);

    const firstMoveTurn = lineTurn === 'w' ? 'b' : 'w';
    const normalizedFirstMove = normalizeScoreObject(line?.firstMoveScore);
    const normalizedLine = normalizeScoreObject(line?.score);
    const scoreObj = normalizedFirstMove || normalizedLine;
    const scoreTurn = normalizedFirstMove ? firstMoveTurn : lineTurn;
    const fromScores = toClassificationWhiteEval(scoreObj, scoreTurn);
    if (Number.isFinite(fromScores)) return fromScores;

    // Match RightSidebar: use white-perspective eval when mapped classification is unavailable.
    let lineWhiteEval = null;
    if (line.score && Number.isFinite(Number(line.score.value))) {
      const t = String(line.score.type || '').toLowerCase();
      if (t === 'cp' || t === 'mate') {
        let v = t === 'cp' ? line.score.value / 100 : line.score.value;
        if (lineTurn === 'b') v = -v;
        lineWhiteEval = v;
      }
    }
    let firstMoveWhiteEval = null;
    if (line.firstMoveScore && Number.isFinite(Number(line.firstMoveScore.value))) {
      const t = String(line.firstMoveScore.type || '').toLowerCase();
      if (t === 'cp' || t === 'mate') {
        let v = t === 'cp' ? line.firstMoveScore.value / 100 : line.firstMoveScore.value;
        if (firstMoveTurn === 'b') v = -v;
        firstMoveWhiteEval = v;
      }
    } else if (Number.isFinite(lineWhiteEval)) {
      firstMoveWhiteEval = lineWhiteEval;
    }
    return Number.isFinite(firstMoveWhiteEval)
      ? firstMoveWhiteEval
      : (Number.isFinite(lineWhiteEval) ? lineWhiteEval : null);
  }, [normalizeScoreObject, toClassificationWhiteEval]);

  const classifyByDelta = useCallback((delta) => {
    if (!Number.isFinite(delta)) return null;
    if (delta <= 0) return 'best';
    if (delta < 0.2) return 'excellent';
    if (delta < 0.5) return 'good';
    if (delta < 1.0) return 'inaccuracy';
    if (delta < 2.0) return 'mistake';
    return 'blunder';
  }, []);

  const getLineClassificationLabels = useCallback((data, lineTurn) => {
    if (!data || !Array.isArray(data.lines) || data.lines.length === 0) return [];

    const prefersLowerEval = lineTurn === 'b';

    const evals = data.lines.map((line) => getLineClassificationWhiteEval(line, lineTurn));

    const finiteEvals = evals.filter((v) => Number.isFinite(v));
    if (finiteEvals.length === 0) return evals.map(() => 'N/A');

    const bestEval = prefersLowerEval ? Math.min(...finiteEvals) : Math.max(...finiteEvals);
    return evals.map((evalVal) => {
      if (!Number.isFinite(evalVal)) return 'N/A';
      const deltaFromBest = prefersLowerEval
        ? (evalVal - bestEval)
        : (bestEval - evalVal);
      return classifyByDelta(deltaFromBest) || 'N/A';
    });
  }, [classifyByDelta, getLineClassificationWhiteEval]);

  const positionToFENExport = useCallback((pos, t, cr, epSq) => {
    const rows = [8, 7, 6, 5, 4, 3, 2, 1].map((r) => {
      let empty = 0;
      let rowStr = '';
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].forEach((f) => {
        const p = pos[f + r];
        if (!p) empty++;
        else {
          if (empty > 0) { rowStr += empty; empty = 0; }
          const type = p[1];
          const letter = ({ P: 'P', N: 'N', B: 'B', R: 'R', Q: 'Q', K: 'K' })[type];
          rowStr += p[0] === 'w' ? letter : letter.toLowerCase();
        }
      });
      if (empty > 0) rowStr += empty;
      return rowStr;
    });
    const board = rows.join('/');
    const turnStr = t === 'w' ? 'w' : 'b';
    let castlingStr = '';
    if (cr && typeof cr === 'object') {
      if (cr.wK) castlingStr += 'K';
      if (cr.wQ) castlingStr += 'Q';
      if (cr.bK) castlingStr += 'k';
      if (cr.bQ) castlingStr += 'q';
    }
    if (!castlingStr) castlingStr = '-';
    const ep = epSq == null || epSq === '' ? '-' : epSq;
    return `${board} ${turnStr} ${castlingStr} ${ep} 0 1`;
  }, []);

  const buildExportRowAtIndex = useCallback((idx, pipelineRows) => {
    const entry = timeline[idx];
    if (!entry) return null;

    const moveData = history[idx - 1] || { san: 'Starting Position', color: 'w', uci: '-' };
    const moveNumber = Math.floor((idx + 1) / 2);
    const actualTurn = idx === 0 ? 'w' : (history[idx - 1].color);

    const data = analysis[idx];
    const targetIdx = idx > 0 ? idx - 1 : 0;
    const rows = pipelineRows ?? pipelineData;
    const pipe = rows[targetIdx]?.tables || {};

    const rowFenAfter = positionToFENExport(entry.position, entry.turn, entry.castling, entry.enPassantTarget);
    const rowFenBefore = idx > 0
      ? positionToFENExport(timeline[idx - 1].position, timeline[idx - 1].turn, timeline[idx - 1].castling, timeline[idx - 1].enPassantTarget)
      : rowFenAfter;

    let playedEvalStr = '0.00';
    let playedMoveClass = 'N/A';
    let playedMoveStanding = 'N/A';
    let evalBeforeMove = '0.00';
    let delta = '0.00';
    let bestLineDelta = 'N/A';
    let winPctStr = '50.0%';

    if (data) {
      const turnOfAnalysis = entry.turn;

      const moveUCI = history[idx - 1]?.uci;
      let pEval = null;
      if (moveUCI) {
        if (data?.playedMoveEval) {
          const pme = data.playedMoveEval;
          let val = pme.type === 'cp' ? pme.value / 100 : pme.value;
          if (timeline[idx - 1].turn === 'b') val = -val;
          pEval = pme.type === 'mate' ? `#${val}` : (val >= 0 ? '+' : '') + val.toFixed(2);
        } else if (data?.lines) {
          const line = data.lines.find((l) => l.pv.startsWith(moveUCI));
          if (line) {
            let val = line.score.type === 'cp' ? line.score.value / 100 : line.score.value;
            if (timeline[idx - 1].turn === 'b') val = -val;
            pEval = line.score.type === 'mate' ? `#${val}` : (val >= 0 ? '+' : '') + val.toFixed(2);
          }
        }
      }

      playedEvalStr = pEval || (data.score ? (data.score.type === 'cp' ? (data.score.value / 100 * (turnOfAnalysis === 'b' ? -1 : 1)).toFixed(2) : `#${data.score.value}`) : '0.00');

      if (idx > 0 && analysis[idx - 1]?.score) {
        const sBefore = analysis[idx - 1].score;
        const tBefore = timeline[idx - 1].turn;
        let vBefore = sBefore.type === 'cp' ? sBefore.value / 100 : sBefore.value;
        if (tBefore === 'b') vBefore = -vBefore;
        evalBeforeMove = sBefore.type === 'mate' ? `#${vBefore}` : (vBefore >= 0 ? '+' : '') + vBefore.toFixed(2);
      }

      if (typeof data?.winProbability?.white === 'number' && Number.isFinite(data.winProbability.white)) {
        winPctStr = `${Math.max(0, Math.min(100, data.winProbability.white)).toFixed(1)}%`;
      } else if (data.score) {
        const s = data.score;
        let v = s.type === 'cp' ? s.value / 100 : s.value;
        if (turnOfAnalysis === 'b') v = -v;
        let winPct;
        if (s.type === 'mate') {
          winPct = v > 0 ? 100 : 0;
        } else {
          winPct = (1 / (1 + Math.pow(10, -v * 100 / 400))) * 100;
        }
        winPctStr = winPct.toFixed(1) + '%';
      }
    }

    const cNum = parseFloat(playedEvalStr.replace('#', '100')) || 0;
    const pNum = parseFloat(evalBeforeMove.replace('#', '100')) || 0;
    delta = (cNum - pNum).toFixed(2);

    const altData = data;
    // Side to move at previous_fen (same as MultiPV / RightSidebar): timeline[idx-1].turn for move rows.
    const rawLineTurn =
      idx > 0
        ? (timeline[idx - 1]?.turn || history[idx - 1]?.color || 'w')
        : (timeline[0]?.turn || 'w');
    const lineTurn = rawLineTurn === 'b' ? 'b' : 'w';
    if (idx > 0 && history[idx - 1]?.uci) {
      const playedMeta = getPlayedMoveClassAndStandingAtNavIndex(analysis, timeline, history, idx, bookStatusByPly);
      playedMoveClass = playedMeta.moveClass || 'N/A';
      playedMoveStanding = Number.isFinite(playedMeta.standing) ? `#${playedMeta.standing}` : 'N/A';
    }

    const lines = Array.isArray(altData?.lines) ? altData.lines : [];
    const bestLineScoreText = lines[0] ? formatLineScoreForExport(lines[0], lineTurn) : null;
    const playedCp = String(playedEvalStr || '').trim().startsWith('#') ? null : parseFloat(playedEvalStr);
    const bestCp = bestLineScoreText && !String(bestLineScoreText).trim().toUpperCase().startsWith('M') && !String(bestLineScoreText).trim().startsWith('#')
      ? parseFloat(bestLineScoreText)
      : null;
    if (Number.isFinite(playedCp) && Number.isFinite(bestCp)) {
      bestLineDelta = (playedCp - bestCp).toFixed(2);
    }
    const alternatives = lines.length
      ? lines.map((l) => {
          const lScore = formatLineScoreForExport(l, lineTurn);
          const firstMove = l?.pv?.split(' ')?.[0] || 'N/A';
          return `${firstMove} (${lScore})`;
        }).join('; ')
      : 'N/A';

    const multiPVDetails = [];
    const lineClassifications = getLineClassificationLabels({ lines }, lineTurn);
    for (let i = 0; i < 3; i++) {
      const line = lines[i];
      if (line) {
        const lScore = formatLineScoreForExport(line, lineTurn);
        const cls = lineClassifications[i];
        multiPVDetails.push(lScore, cls != null && cls !== '' ? cls : 'N/A', line?.pv ? String(line.pv) : 'N/A');
      } else {
        multiPVDetails.push('N/A', 'N/A', 'N/A');
      }
    }

    const baseInfo = [
      idx === 0 ? 0 : moveNumber,
      idx === 0 ? '-' : (actualTurn === 'w' ? 'White' : 'Black'),
      idx === 0 ? 'Start' : moveData.san,
      idx === 0 ? '-' : moveData.uci,
      idx === 0 ? '-' : (moveData.clock || 'N/A'),
      idx === 0 ? 'N/A' : playedMoveClass,
      idx === 0 ? 'N/A' : playedMoveStanding,
      playedEvalStr,
      evalBeforeMove,
      delta,
      bestLineDelta,
      winPctStr,
      rowFenBefore,
      rowFenAfter,
      countLegalMovesAtPly(timeline, idx),
      alternatives,
      pipe.t11?.captures?.join('; ') || 'None',
    ];

    const pipelineInfo = [
      pipe.t1?.derived?.game_phase || 'N/A',
      pipe.t2?.density || 'N/A',
      pipe.t2?.spatial_dominance?.white || '0',
      pipe.t2?.spatial_dominance?.black || '0',
      pipe.t3?.white || '0',
      pipe.t3?.black || '0',
      pipe.t3?.advantage || '0',
      pipe.t3?.simplification || 'N/A',
      pipe.t4?.hanging?.join('; ') || 'None',
      pipe.t4?.loose?.join('; ') || 'None',
      pipe.t5?.white?.attack_intensity || '0',
      pipe.t5?.white?.exposure || 'N/A',
      pipe.t5?.black?.attack_intensity || '0',
      pipe.t5?.black?.exposure || 'N/A',
      pipe.t5?.white?.mobility || '0',
      pipe.t5?.black?.mobility || '0',
      pipe.t6?.white?.islands || '0',
      pipe.t6?.white?.doubled?.length || '0',
      pipe.t6?.black?.islands || '0',
      pipe.t6?.black?.doubled?.length || '0',
      pipe.t7?.white?.avg_mobility || '0',
      pipe.t7?.black?.avg_mobility || '0',
      pipe.t7?.white?.freedom || 'N/A',
      pipe.t7?.black?.freedom || 'N/A',
      pipe.t8?.white_controlled || '0',
      pipe.t8?.black_controlled || '0',
      pipe.t8?.ratio || '1.0',
      pipe.t9?.pins?.join('; ') || 'None',
      pipe.t9?.forks?.join('; ') || 'None',
      pipe.t13?.endgame_proximity || 'N/A',
      pipe.t15?.white?.practical_risk || 'N/A',
      pipe.t15?.black?.practical_risk || 'N/A',
      pipe.t16?.overall || 'N/A',
      pipe.t16?.winning_plan || 'N/A',
      enhancedCommentaries[idx] || (idx === 0 ? 'Starting Position' : 'N/A'),
      flanT5Outputs[idx] || (idx === 0 ? '-' : 'N/A'),
    ];

    return [...baseInfo, ...pipelineInfo, ...multiPVDetails];
  }, [
    timeline,
    history,
    analysis,
    pipelineData,
    enhancedCommentaries,
    flanT5Outputs,
    getLineClassificationLabels,
    formatLineScoreForExport,
    positionToFENExport,
    bookStatusByPly,
  ]);

  const persistedPliesRef = useRef(new Set());
  const persistInFlightRef = useRef(new Set());
  const sessionCompletedPatchedRef = useRef(false);

  useEffect(() => {
    persistedPliesRef.current.clear();
    persistInFlightRef.current.clear();
    sessionCompletedPatchedRef.current = false;
  }, [analysisSessionId]);

  useEffect(() => {
    if (!analysisSessionId || timeline.length === 0) return;

    const allAnalyzed = () => timeline.every((_, i) => {
      const x = analysis[i];
      return x && (x.score || x.error);
    });

    const persistPly = async (idx) => {
      if (persistInFlightRef.current.has(idx) || persistedPliesRef.current.has(idx)) return;
      const a = analysis[idx];
      if (!a || (!a.score && !a.error)) return;

      persistInFlightRef.current.add(idx);
      try {
        const rowCells = buildExportRowAtIndex(idx);
        if (!rowCells || rowCells.length !== ANALYSIS_ROW_CELL_KEYS.length) {
          console.warn('[persist] bad row length', idx, rowCells?.length);
          return;
        }
        const payload = { ply_index: idx };
        ANALYSIS_ROW_CELL_KEYS.forEach((key, i) => {
          const cell = rowCells[i];
          payload[key] = cell != null ? String(cell) : '';
        });
        payload.stockfish_json = JSON.stringify(a);
        payload.pipeline_json = JSON.stringify(pipelineData[idx] ?? null);

        const res = await fetch(`${API_BASE}/api/sessions/${analysisSessionId}/moves`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await res.text());
        persistedPliesRef.current.add(idx);

        const analyzedCount = timeline.filter((_, i) => {
          const x = analysis[i];
          return x && (x.score || x.error);
        }).length;

        await fetch(`${API_BASE}/api/sessions/${analysisSessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            progress_current: analyzedCount,
            progress_total: timeline.length,
          }),
        });

        if (
          !sessionCompletedPatchedRef.current &&
          allAnalyzed() &&
          persistedPliesRef.current.size === timeline.length
        ) {
          sessionCompletedPatchedRef.current = true;
          await fetch(`${API_BASE}/api/sessions/${analysisSessionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: 'completed',
              progress_current: analyzedCount,
              progress_total: timeline.length,
            }),
          });
        }
      } catch (e) {
        console.error('[persist] ply', idx, e);
      } finally {
        persistInFlightRef.current.delete(idx);
      }
    };

    for (let i = 0; i < timeline.length; i++) {
      persistPly(i);
    }
  }, [
    analysisSessionId,
    timeline,
    analysis,
    pipelineData,
    mlInputs,
    mlOutputs,
    buildExportRowAtIndex,
  ]);

  const handleCopyCSV = useCallback(async () => {
    if (analysis.length === 0) {
      alert('No analysis data to copy.');
      return;
    }

    let rowsPipeline = pipelineData;
    try {
      rowsPipeline = await ensurePipelineSlotsForExport(timeline, pipelineData, positionToFENExport);
      mergePipelineSlots(rowsPipeline);
    } catch (e) {
      console.error('[export] pipeline prefetch', e);
    }

    const dataRows = timeline.map((_, idx) => buildExportRowAtIndex(idx, rowsPipeline)).filter(Boolean);

    const csvContent = [
      EXPORT_HEADERS.join(','),
      ...dataRows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    try {
      await navigator.clipboard.writeText(csvContent);
      alert('CSV data copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy CSV: ', err);
      alert('Failed to copy CSV. Check console for details.');
    }
  }, [analysis.length, timeline, pipelineData, mergePipelineSlots, buildExportRowAtIndex, positionToFENExport]);

  const handleExportExcel = useCallback(async () => {
    if (analysis.length === 0) {
      alert('No analysis data to export.');
      return;
    }

    let rowsPipeline = pipelineData;
    try {
      rowsPipeline = await ensurePipelineSlotsForExport(timeline, pipelineData, positionToFENExport);
      mergePipelineSlots(rowsPipeline);
    } catch (e) {
      console.error('[export] pipeline prefetch', e);
    }

    const dataRows = timeline.map((_, idx) => buildExportRowAtIndex(idx, rowsPipeline)).filter(Boolean);

    const ws = XLSX.utils.aoa_to_sheet([EXPORT_HEADERS, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Chess Analysis');
    XLSX.writeFile(wb, 'Chess_Analysis_Report.xlsx');
  }, [analysis.length, timeline, pipelineData, mergePipelineSlots, buildExportRowAtIndex, positionToFENExport]);

  const playedMeta = getPlayedMoveClassAndStandingAtNavIndex(analysis, timeline, history, navIndex, bookStatusByPly);
  const playedMoveStanding = Number.isFinite(playedMeta.standing) ? playedMeta.standing : 1;

  const parseClock = (clockStr) => {
    if (!clockStr) return null;
    const parts = clockStr.split(':');
    if (parts.length === 3) {
      return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    }
    if (parts.length === 2) {
      return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return parseFloat(clockStr);
  };

  const parseTimeControl = (tc) => {
    if (!tc) return { initial: 0, increment: 0 };
    const parts = tc.split('+');
    return {
      initial: parseInt(parts[0]) || 0,
      increment: parseInt(parts[1]) || 0
    };
  };

  const [behaviorScores, setBehaviorScores] = React.useState(null);

  const fetchBehaviorScores = useCallback(async (moves) => {
    try {
      const res = await fetch(`${API_BASE}/api/behavior/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moves })
      });
      if (res.ok) {
        const data = await res.json();
        setBehaviorScores(data);
      }
    } catch (e) {
      console.error('Failed to fetch behavior scores', e);
    }
  }, []);

  // Recalculate behavior scores when analysis is updated
  useEffect(() => {
    // Only calculate if we have enough analysis data
    const analyzedMoves = timeline.map((_, idx) => {
      if (idx === 0) return null;
      const data = analysis[idx];
      const pipe = pipelineData[idx];
      if (!data || !pipe) return null;
      
      const { initial, increment } = parseTimeControl(pgnMetadata?.TimeControl);
      const currentMoveData = history[idx - 1];
      const currentClock = parseClock(currentMoveData?.clock);
      let prevClock = initial;
      if (idx > 2) {
        const prevMoveBySamePlayer = history[idx - 3];
        if (prevMoveBySamePlayer?.clock) {
          prevClock = parseClock(prevMoveBySamePlayer.clock);
        }
      }
      let moveTime = currentClock !== null ? Math.max(0, prevClock - currentClock + increment) : 0;
      
      const parseEval = (evalStr) => {
        if (!evalStr || evalStr === 'N/A') return 0;
        if (evalStr.startsWith('#')) {
          const val = parseInt(evalStr.slice(1));
          return val > 0 ? 15 : -15; // Treat mate as high eval
        }
        return parseFloat(evalStr);
      };

      const sideToMove = history[idx - 1]?.color || 'w';
      const meta = getPlayedMoveClassAndStandingAtNavIndex(analysis, timeline, history, idx, bookStatusByPly);
      const playedEvalStr = formatLineScoreForExport(data, sideToMove);
      const playedEval = parseEval(playedEvalStr);
      const topEvalStr = data.lines?.[0] ? formatLineScoreForExport(data.lines[0], sideToMove) : playedEvalStr;
      const topEval = parseEval(topEvalStr);

      return {
        'T': moveTime,
        'Top Line Eval': topEval,
        'Played Move Evaluation': playedEval,
        'Classification': meta.moveClass || 'N/A',
        'Move Number': Math.floor((idx + 1) / 2),
        'Game Phase': pipe.tables?.t1?.derived?.game_phase || 'N/A',
        'Played Move Standing': meta.standing || 1
      };
    }).filter(Boolean);

    if (analyzedMoves.length > 2) { // Reduced threshold for earlier feedback
      fetchBehaviorScores(analyzedMoves);
    }
  }, [analysis, pipelineData, history, pgnMetadata, fetchBehaviorScores, timeline, bookStatusByPly]);

  // Aggregate ALL move inputs into a single array for commentary and display
  useEffect(() => {
    const aggregatedInputs = timeline.map((entry, idx) => {
      const moveData = history[idx - 1] || { san: 'Starting Position', color: 'w', uci: '-' };
      const moveNumber = Math.floor((idx + 1) / 2);
      const data = analysis[idx];
      const pipe = pipelineData[idx];
      const book = bookStatusByPly[idx];
      const mInputs = mlInputs[idx];
      const mOutputs = mlOutputs[idx];

      if (!data && idx > 0) return null;

      const sideToMove = idx === 0 ? 'w' : (history[idx - 1]?.color || 'w');
      const meta = getPlayedMoveClassAndStandingAtNavIndex(analysis, timeline, history, idx, bookStatusByPly);
      
      const { initial, increment } = parseTimeControl(pgnMetadata?.TimeControl);
      const currentClock = parseClock(moveData?.clock);
      let prevClock = initial;
      if (idx > 2) {
        const prevMoveBySamePlayer = history[idx - 3];
        if (prevMoveBySamePlayer?.clock) {
          prevClock = parseClock(prevMoveBySamePlayer.clock);
        }
      }
      let moveTime = currentClock !== null ? Math.max(0, prevClock - currentClock + increment) : 0;

      const rowFenAfter = positionToFENExport(entry.position, entry.turn, entry.castling, entry.enPassantTarget);
      const rowFenBefore = idx > 0
        ? positionToFENExport(timeline[idx - 1].position, timeline[idx - 1].turn, timeline[idx - 1].castling, timeline[idx - 1].enPassantTarget)
        : rowFenAfter;

      // Calculate evaluations and win percentages per-move
      let currentEvalStr = '0.00';
      let previousEvalStr = '0.00';
      let currentEvalVal = 0;
      let previousEvalVal = 0;
      let winPct = 50.0;

      if (data) {
        const turnAtAnalysis = idx === 0 ? 'w' : (history[idx - 1]?.color || 'w');
        
        // Use logic similar to buildExportRowAtIndex
        if (data.playedMoveEval) {
          currentEvalStr = formatLineScoreForExport(data.playedMoveEval, turnAtAnalysis);
          currentEvalVal = data.playedMoveEval.type === 'cp' ? data.playedMoveEval.value / 100 : (data.playedMoveEval.value > 0 ? 15 : -15);
        } else if (data.score) {
          currentEvalStr = formatLineScoreForExport(data, turnAtAnalysis);
          currentEvalVal = data.score.type === 'cp' ? data.score.value / 100 : (data.score.value > 0 ? 15 : -15);
        }

        if (idx > 0 && analysis[idx - 1]?.score) {
          const prevTurn = idx === 1 ? 'w' : (history[idx - 2]?.color || 'w');
          const prevScore = analysis[idx - 1].score;
          previousEvalStr = formatLineScoreForExport(analysis[idx - 1], prevTurn);
          previousEvalVal = prevScore.type === 'cp' ? prevScore.value / 100 : (prevScore.value > 0 ? 15 : -15);
        }

        if (typeof data?.winProbability?.white === 'number') {
          winPct = data.winProbability.white;
        }
      }

      const evalDelta = (currentEvalVal - previousEvalVal).toFixed(2);

      // --- Formula Derivations for Semantic Signals ---
      
      // 1. King Safety (based on attack intensity and exposure)
      const wKS = pipe?.tables?.t5?.white?.attack_intensity || 0;
      const bKS = pipe?.tables?.t5?.black?.attack_intensity || 0;
      const wExp = pipe?.tables?.t5?.white?.exposure || 0;
      const bExp = pipe?.tables?.t5?.black?.exposure || 0;
      
      const currentSide = sideToMove === 'w' ? 'white' : 'black';
      const myKingAttack = currentSide === 'white' ? wKS : bKS;
      const myKingExp = currentSide === 'white' ? wExp : bExp;
      
      let kingSafety = 'Safe';
      if (myKingAttack > 50 || myKingExp > 50) kingSafety = 'Critical';
      else if (myKingAttack > 20 || myKingExp > 20) kingSafety = 'Exposed';
      else if (myKingAttack > 5 || myKingExp > 5) kingSafety = 'Slightly exposed';

      // 3. Space Dominance
      const wSpace = pipe?.tables?.t2?.spatial_dominance?.white || 0;
      const bSpace = pipe?.tables?.t2?.spatial_dominance?.black || 0;
      const spaceDiff = wSpace - bSpace;
      let spaceDominance = 'Equal';
      if (Math.abs(spaceDiff) > 10) spaceDominance = spaceDiff > 0 ? 'White much better' : 'Black much better';
      else if (Math.abs(spaceDiff) > 3) spaceDominance = spaceDiff > 0 ? 'White slightly better' : 'Black slightly better';

      // 4. Mobility
      const wMob = pipe?.tables?.t7?.white?.avg_mobility || 0;
      const bMob = pipe?.tables?.t7?.black?.avg_mobility || 0;
      const mobDiff = wMob - bMob;
      let mobility = 'Normal';
      if (Math.abs(mobDiff) > 5) mobility = mobDiff > 0 ? 'White very active' : 'Black very active';
      else if (Math.abs(mobDiff) > 2) mobility = mobDiff > 0 ? 'White more active' : 'Black more active';

      // 5. Tactical Signals (Redefined with SEE logic)
      const seeLosses = pipe?.tables?.t4?.see_losses || [];
      const loosePieces = pipe?.tables?.t4?.loose || [];
      
      // Find tactical status of the move JUST played
      const moveUCI = moveData.uci;
      const moveSquare = moveUCI !== '-' ? moveUCI.slice(2, 4) : null;
      const moveSEE = seeLosses.find(l => l.square === moveSquare);
      
      let tacticalClassification = 'NONE';
      const absDelta = Math.abs(parseFloat(evalDelta));
      
      const isCheck = moveData.san.includes('+') || moveData.san.includes('#');
      const isCapture = moveData.san.includes('x');

      if (moveSEE) {
        const seeVal = Math.abs(moveSEE.see);
        if (seeVal > 0) {
          if (absDelta > 2.0) {
            tacticalClassification = 'BLUNDER (Losing Material)';
          } else if (meta.moveClass === 'best' || meta.moveClass === 'excellent' || kingSafety === 'Critical') {
            tacticalClassification = 'SACRIFICE (Intentional)';
          } else {
            tacticalClassification = `HANGING / LOSING (-${seeVal})`;
          }
        }
      } else if (moveUCI !== '-') {
        if (isCapture) {
          if (absDelta < 0.2) tacticalClassification = 'EQUAL TRADE';
          else tacticalClassification = 'WINNING MOVE / FAVORABLE TRADE';
        } else if (isCheck) {
          tacticalClassification = 'FORCING MOVE (Check)';
        } else if (parseFloat(evalDelta) > 0.5 && meta.moveClass === 'best') {
          tacticalClassification = 'TACTICAL SHOT';
        }
      }

      if (tacticalClassification === 'NONE' && absDelta > 1.5 && meta.moveClass !== 'best') {
        tacticalClassification = 'MISS (Tactical Opportunity)';
      }

      const otherHanging = seeLosses
        .filter(l => l.square !== moveSquare)
        .map(l => `${l.piece} on ${l.square} (-${Math.abs(l.see)})`)
        .join(', ');

      const turnColor = idx === 0 ? 'Start' : (sideToMove === 'w' ? 'White' : 'Black');
      const englishMove = getEnglishMoveDescription(moveData.san, turnColor, idx);
      const bookName = book?.opening?.name || 'N/A';

      // Current FEN for predicting next moves
      const currentPlyFEN = positionToFENExport(entry.position, entry.turn, entry.castling, entry.enPassantTarget);
      
      const nextBestMoves = (data?.lines || []).slice(0, 3).map((l, lIdx) => {
        const moveUCI = l.pv?.split(' ')?.[0];
        let moveSAN = 'N/A';
        
        if (moveUCI && moveUCI !== 'N/A') {
          try {
            const chess = new Chess(currentPlyFEN);
            const moveResult = chess.move(moveUCI);
            if (moveResult) {
              moveSAN = moveResult.san;
            }
          } catch (e) {
            console.warn('Failed to find move SAN', e);
          }
        }

        const lineClasses = getLineClassificationLabels(data, sideToMove);

        return {
          "move": moveSAN !== 'N/A' ? moveSAN : (moveUCI || 'N/A'),
          "uci": moveUCI || 'N/A',
          "eval": formatLineScoreForExport(l, sideToMove),
          "classification": lineClasses[lIdx] || 'N/A'
        };
      });

      const jsonInputs = {
        "move": moveData.san,
        "english_move": englishMove,
        "turn": turnColor,
        "classification": meta.moveClass || 'N/A',
        "book_move_name": bookName,
        "played_eval": currentEvalStr,
        "eval_before": previousEvalStr,
        "best_engine": data?.lines?.[0]?.pv?.split(' ')?.[0] || 'N/A',
        "best_move_san": nextBestMoves[0]?.move || 'N/A',
        "best_eval": data?.lines?.[0] ? formatLineScoreForExport(data.lines[0], sideToMove) : 'N/A',
        "top_3_next_moves": nextBestMoves,
        "game_phase": pipe?.tables?.t1?.derived?.game_phase || 'N/A',
        "tactical_classification": tacticalClassification,
        "king_safety": kingSafety,
        "space_dominance": spaceDominance,
        "mobility": mobility
      };

      return {
        ...jsonInputs,
        generated_commentary: null,
        // Keep internal IDs for navigation
        plyIndex: idx,
        moveNo: moveNumber,
        uci: moveData.uci,
        mlOutputs: mOutputs || null
      };
     });
 
     if (aggregatedInputs.length > 0) {
       setAllMoveInputs(aggregatedInputs);
     }
  }, [analysis, pipelineData, history, pgnMetadata, timeline, bookStatusByPly, mlInputs, mlOutputs, behaviorScores, formatLineScoreForExport, positionToFENExport]);

  const behavioralInsights = useMemo(() => {
    if (navIndex === 0) return null;

    const { initial, increment } = parseTimeControl(pgnMetadata?.TimeControl);
    
    const currentMoveData = history[navIndex - 1];
    if (!currentMoveData) return null;

    const currentClock = parseClock(currentMoveData.clock);
    
    let prevClock = initial;
    if (navIndex > 2) {
      const prevMoveBySamePlayer = history[navIndex - 3];
      if (prevMoveBySamePlayer?.clock) {
        prevClock = parseClock(prevMoveBySamePlayer.clock);
      }
    }

    let moveTime = null;
    if (currentClock !== null) {
      moveTime = prevClock - currentClock + increment;
    }

    const data = analysis[navIndex];
    // For move at navIndex, side to move was history[navIndex-1].color
    const sideToMove = history[navIndex - 1]?.color || 'w';
    const topLineEval = data?.lines?.[0] 
      ? formatLineScoreForExport(data.lines[0], sideToMove === 'w' ? 'w' : 'b') 
      : 'N/A';

    return {
      moveTime: moveTime !== null ? Math.max(0, moveTime).toFixed(1) + 's' : 'N/A',
      topLineEval,
      playedMoveEval: playedMoveEval || 'N/A',
      classification: playedMeta.moveClass || 'N/A',
      moveNumber: Math.floor((navIndex + 1) / 2),
      gamePhase: pipelineData[navIndex]?.tables?.t1?.derived?.game_phase || 'N/A',
      moveStanding: Number.isFinite(playedMeta.standing) ? `#${playedMeta.standing}` : 'N/A',
      timeControl: pgnMetadata?.TimeControl || 'N/A'
    };
  }, [navIndex, history, pgnMetadata, analysis, pipelineData, playedMoveEval, playedMeta, formatLineScoreForExport]);

  const dataPipelineTable = (
    <DataPipelineTable 
      fen={currentFEN} 
      fenAtMove={fenAtMove}
      currentMove={currentMove}
      moveNo={navIndex === 0 ? 0 : Math.floor((navIndex + 1) / 2)}
      player={navIndex === 0 ? 'White' : (history[navIndex - 1]?.color === 'w' ? 'White' : 'Black')}
      playedMoveStanding={playedMoveStanding}
      bestMove={bestMove}
      winPercent={winPercent}
      displayScore={displayScore}
      bestMovesList={bestMovesList}
      prevEval={prevEval}
      playedMoveEval={playedMoveEval}
      legalMovesCount={legalMovesCount}
      bookStatus={bookStatusByPly[navIndex] || null}
      bookStatusByPly={bookStatusByPly}
      outOfBookFromPly={firstNonBookPly}
      pipelineData={pipelineData[navIndex]}
      mlInputs={mlInputs[navIndex]} 
      mlOutputs={mlOutputs[navIndex]}
      mlLoading={pipelineData[navIndex] && (!mlInputs[navIndex] || !mlOutputs[navIndex]) && navIndex !== 0}
      pipelineSlotIndex={navIndex}
      onPipelineFetched={mergePipelineDataAtIndex}
      commentaryInputs={{
        ...allMoveInputs[navIndex],
        generated_commentary: enhancedCommentaries[navIndex] || allMoveInputs[navIndex]?.generated_commentary,
        flan_t5_output: flanT5Outputs[navIndex] || null
      }}
      behavioralInsights={behavioralInsights}
      behaviorScores={behaviorScores}
    />
  );

  return (
    <div className="flex flex-col w-full min-h-screen font-sans bg-white px-3 sm:px-4 lg:px-6 pt-1 sm:pt-2 lg:pt-4 pb-12 pb-safe">
      <div className="shrink-0">
        <Header 
          className="lg:items-center"
          onCopyCSV={handleCopyCSV} 
          showCopyCSV={true} 
          onExportExcel={handleExportExcel}
          analysisProgress={analysisProgress}
        />
      </div>
      <main className="max-w-[1600px] mx-auto w-full flex flex-col lg:flex-row gap-4 lg:gap-6 mt-0 lg:mt-1 justify-between lg:items-start">
        <div className="hidden lg:flex lg:order-1 min-h-0 w-full lg:w-auto lg:max-w-[16rem] shrink-0 pt-12">
          <LeftSidebar 
            history={history} 
            navIndex={navIndex} 
            setNavIndex={setNavIndex} 
            timeline={timeline} 
            loadPGN={loadPGN}
            mlOutputs={mlOutputs[navIndex]}
            mlLoading={pipelineData[navIndex] && (!mlInputs[navIndex] || !mlOutputs[navIndex]) && navIndex !== 0}
            moveClassifications={moveClassifications}
            boardWidth={boardWidth}
          />
        </div>
        <section className="w-full min-w-0 lg:flex-1 flex flex-col items-center justify-center gap-2 lg:gap-4 min-h-0 pt-12 pb-2 lg:order-2">
          <div className="board-and-eval w-full flex-none min-h-0 order-1 lg:order-2 flex flex-col items-center justify-center gap-1" ref={boardContainerRef}>
            <div 
              className="inline-flex flex-row gap-4 items-center justify-center p-2 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden"
              style={{ height: `${boardWidth + 112}px` }}
            >
              <EvaluationBar 
                percent={evalPercent} 
                display={displayScore} 
                orientation={orientation}
                barHeight={boardWidth}
              />
              <div className="flex flex-col gap-2 min-w-0" style={{ width: boardWidth, height: boardWidth + 96 }}>
                <PlayerBadge {...topPlayer} />
                <div className="chessboard-wrapper" style={{ width: boardWidth, height: boardWidth }}>
                  <Chessboard
                    id="AnalyzeBoard"
                    boardWidth={boardWidth}
                    position={position}
                    onPieceDrop={onPieceDrop}
                    onSquareClick={onSquareClick}
                    boardOrientation={orientation}
                    customDarkSquareStyle={{ backgroundColor: '#769656' }}
                    customLightSquareStyle={{ backgroundColor: '#eeeed2' }}
                    customSquareStyles={{
                      ...targets.reduce((acc, sq) => ({ ...acc, [sq]: { background: 'rgba(255, 255, 0, 0.4)' } }), {}),
                      ...(selected && { [selected]: { background: 'rgba(255, 255, 0, 0.4)' } })
                    }}
                  />
                </div>
                <PlayerBadge {...bottomPlayer} />
              </div>
            </div>
          </div>
        </section>
        <div className="hidden lg:flex lg:order-3 min-h-0 w-full lg:w-auto lg:max-w-[20rem] shrink-0 pt-12">
          <RightSidebar 
            analysis={analysis} 
            navIndex={navIndex} 
            turn={currentTurn} 
            timeline={timeline}
            history={history}
            currentMove={currentMove}
            playedMoveEval={playedMoveEval}
            legalMovesCount={legalMovesCount}
            bookStatus={bookStatusByPly[navIndex] || null}
            mlOutputs={mlOutputs[navIndex]}
            multipv={multipv}
            boardWidth={boardWidth}
          />
        </div>

        <div className="flex flex-col gap-6 w-full shrink-0 lg:hidden mt-4">
          <LeftSidebar 
            layout="pageStack"
            history={history} 
            navIndex={navIndex} 
            setNavIndex={setNavIndex} 
            timeline={timeline} 
            loadPGN={loadPGN}
            mlOutputs={mlOutputs[navIndex]}
            mlLoading={pipelineData[navIndex] && (!mlInputs[navIndex] || !mlOutputs[navIndex]) && navIndex !== 0}
            moveClassifications={moveClassifications}
            boardWidth={boardWidth}
          />
          <RightSidebar 
            layout="pageStack"
            analysis={analysis} 
            navIndex={navIndex} 
            turn={currentTurn} 
            timeline={timeline}
            history={history}
            currentMove={currentMove}
            playedMoveEval={playedMoveEval}
            legalMovesCount={legalMovesCount}
            bookStatus={bookStatusByPly[navIndex] || null}
            mlOutputs={mlOutputs[navIndex]}
            multipv={multipv}
            boardWidth={boardWidth}
          />
        </div>
      </main>

      <div className="relative z-0 max-w-[1600px] mx-auto w-full shrink-0 mt-4 sm:mt-6 lg:mt-8 mb-6 sm:mb-10 overflow-x-auto border-t border-slate-100 pt-4 lg:pt-6">
        {dataPipelineTable}
      </div>
    </div>
  );
};

export default AnalyzePage;
