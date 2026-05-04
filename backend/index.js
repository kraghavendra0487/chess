const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { db, dbPath } = require('./db/database');
const { mountAnalysisHistoryRoutes } = require('./routes/analysisHistory');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  const start = Date.now();
  const meta = { ip: req.ip, method: req.method, url: req.originalUrl, query: req.query, length: parseInt(req.headers['content-length'] || '0', 10) };
  console.log('[REQ]', meta);
  res.on('finish', () => {
    console.log('[RES]', { status: res.statusCode, ms: Date.now() - start, url: req.originalUrl });
  });
  next();
});

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from Node.js backend!' });
});

let workingPython = 'python';

function runEngineDirect({ fen, depth, movetime, multipv, searchmoves, moves }) {
  return new Promise((resolve, reject) => {
    const exePath = path.join(__dirname, '..', 'stockfish', 'stockfish-windows-x86-64-avx2.exe');
    if (!fs.existsSync(exePath)) {
      return reject(new Error(`Stockfish not found at ${exePath}`));
    }
    const proc = spawn(exePath);
    const lines = [];
    let stdoutBuffer = '';

    const timerMs = movetime ? Math.max(3000, parseInt(movetime, 10) + 3000) : Math.max(15000, (parseInt(depth || 16, 10) * 1000));
    const timer = setTimeout(() => {
      cleanup(new Error('Engine timeout after ' + timerMs + 'ms'));
    }, timerMs);

    const cleanup = (res) => {
      clearTimeout(timer);
      if (proc.connected || proc.pid) {
        try { proc.kill(); } catch (e) {}
      }
      if (res instanceof Error) reject(res);
      else resolve(res);
    };

    proc.stdout.on('data', (data) => {
      stdoutBuffer += data.toString();
      const chunks = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = chunks.pop(); // Last partial line remains in buffer

      for (const line of chunks) {
        if (!line) continue;
        lines.push(line);
        console.log('[SF]', line);
        
        if (line.startsWith('bestmove')) {
          try {
            const result = parseEngineLines(lines);
            console.log('[SF] Parsed Result:', JSON.stringify(result));
            cleanup(result);
          } catch (e) {
            cleanup(e);
          }
          return;
        }
      }
    });

    proc.on('error', (err) => {
      console.error('[SF ERROR]', err);
      cleanup(err);
    });

    const send = (cmd) => {
      if (proc.stdin.writable) {
        proc.stdin.write(cmd + '\n');
      }
    };

    // UCI protocol: send commands one by one
    send('uci');
    send('isready');
    send('ucinewgame');
    send('isready'); // Extra isready after ucinewgame
    
    if (parseInt(multipv || 0, 10) > 1) {
      send(`setoption name MultiPV value ${parseInt(multipv, 10)}`);
    }
    
    if (moves) {
      send(`position startpos moves ${moves}`);
    } else if (fen) {
      send(`position fen ${fen}`);
    }
    
    const goCmd = `go depth ${depth || 16} ${movetime ? 'movetime ' + movetime : ''} ${searchmoves ? 'searchmoves ' + searchmoves : ''}`;
    send(goCmd);
  });
}

async function runEngineWithFallbacks(primaryOpts, fallbackOptsList = []) {
  const attempts = [primaryOpts, ...fallbackOptsList].filter(Boolean);
  let lastErr = null;

  for (const opts of attempts) {
    try {
      return await runEngineDirect(opts);
    } catch (err) {
      lastErr = err;
      console.warn('[ANALYZE][RETRY]', {
        fen: opts?.fen,
        depth: opts?.depth,
        movetime: opts?.movetime,
        multipv: opts?.multipv,
        error: err?.message || String(err),
      });
    }
  }

  throw lastErr || new Error('Engine analysis failed');
}

function parseEngineLines(lines) {
  let score = null;
  let outDepth = 0;
  let bestmove = null;
  let ponder = null;
  let pv = null;
  const multi = {};

  for (const line of lines) {
    if (!line) continue;
    const parts = line.split(/\s+/);
    
    if (line.startsWith('bestmove')) {
      bestmove = parts[1] === '(none)' ? null : parts[1];
      ponder = parts[3] && parts[2] === 'ponder' ? parts[3] : null;
      continue;
    }
    
    if (!line.startsWith('info ')) continue;
    
    const mpIdx = parts.indexOf('multipv');
    const hasMulti = mpIdx !== -1 && mpIdx + 1 < parts.length;
    const mp = hasMulti ? parseInt(parts[mpIdx + 1], 10) : 1;
    
    const dIdx = parts.indexOf('depth');
    if (dIdx !== -1 && dIdx + 1 < parts.length) {
      const dVal = parseInt(parts[dIdx + 1], 10);
      if (!isNaN(dVal)) {
        outDepth = Math.max(outDepth, dVal);
        if (hasMulti) {
          multi[mp] = multi[mp] || {};
          multi[mp].depth = dVal;
        }
      }
    }
    
    const sIdx = parts.indexOf('score');
    if (sIdx !== -1 && sIdx + 2 < parts.length) {
      const type = parts[sIdx + 1]; // 'cp' or 'mate'
      const value = parseInt(parts[sIdx + 2], 10);
      if (!isNaN(value)) {
        const sc = { type, value };
        if (hasMulti) {
          multi[mp] = multi[mp] || {};
          multi[mp].score = sc;
        } else {
          score = sc;
        }
      }
    }
    
    const pvIdx = parts.indexOf('pv');
    if (pvIdx !== -1 && pvIdx + 1 < parts.length) {
      const pvStr = parts.slice(pvIdx + 1).join(' ');
      if (hasMulti) {
        multi[mp] = multi[mp] || {};
        multi[mp].pv = pvStr;
      } else {
        pv = pvStr;
      }
    }
  }

  const linesOut = Object.keys(multi)
    .map(k => ({ multipv: parseInt(k, 10), ...multi[k] }))
    .filter(l => l.score && l.pv)
    .sort((a, b) => a.multipv - b.multipv);

  if (linesOut.length > 0) {
    if (!score) score = linesOut[0].score;
    if (!pv) pv = linesOut[0].pv;
  }

  return { 
    bestmove, 
    ponder, 
    score: score || { type: 'cp', value: 0 }, 
    depth: outDepth, 
    pv, 
    lines: linesOut 
  };
}

function scoreToWhiteWinProbability(score, turnForPosition) {
  if (!score || typeof score.value !== 'number') return 50;
  let v = score.type === 'cp' ? score.value / 100 : score.value;
  if (turnForPosition === 'b') v = -v;
  if (score.type === 'mate') {
    if (v > 0) return 100;
    if (v < 0) return 0;
    return turnForPosition === 'w' ? 0 : 100;
  }
  if (v >= 8) return 100;
  if (v >= 4) return 90 + ((v - 4) / 4) * 10;
  if (v >= 0) return 50 + (v / 4) * 40;
  if (v >= -4) return 10 + ((v + 4) / 4) * 40;
  if (v >= -8) return ((v + 8) / 4) * 10;
  return 0;
}

async function computeFirstMoveScores({ previousFen, lines, depth, movetime }) {
  if (!previousFen || !Array.isArray(lines) || lines.length === 0) return {};

  const firstMoves = [...new Set(
    lines
      .map((line) => String(line?.pv || '').trim().split(/\s+/)[0])
      .filter(Boolean)
  )];

  const entries = await Promise.all(firstMoves.map(async (mv) => {
    try {
      const result = await runEngineWithFallbacks(
        { fen: previousFen, moves: mv, depth, movetime, multipv: 1 },
        [
          { fen: previousFen, moves: mv, depth: Math.max(10, depth - 2), movetime, multipv: 1 },
          { fen: previousFen, moves: mv, depth: 10, movetime: 1500, multipv: 1 },
        ]
      );
      return [mv, result?.score || null];
    } catch (e) {
      console.warn('[ANALYZE][FIRSTMOVE][RETRY-FAILED]', { move: mv, error: e?.message || String(e) });
      return [mv, null];
    }
  }));

  return Object.fromEntries(entries);
}

app.post('/api/analyze', async (req, res) => {
  const body = req.body || {};
  const { depth, movetime, current_fen, previous_fen, multipv } = body;
  const currentFen = current_fen || body.fen || previous_fen;
  const previousFen = previous_fen || body.fen || current_fen;

  if (!currentFen || !previousFen) {
    res.status(400).json({ error: 'Both current_fen and previous_fen are required' });
    return;
  }
  console.log('[ANALYZE]', { currentFen, previousFen, depth, movetime, multipv });
  
  try {
    const requestedMultiPv = Math.max(1, Math.min(10, parseInt(multipv || 3, 10)));
    const normalizedDepth = parseInt(depth || 16, 10);
    const safeDepth = Number.isFinite(normalizedDepth) ? normalizedDepth : 16;

    const [currentSettled, previousSettled] = await Promise.allSettled([
      runEngineWithFallbacks(
        { fen: currentFen, depth: safeDepth, movetime },
        [
          { fen: currentFen, depth: Math.max(10, safeDepth - 2), movetime, multipv: 1 },
          { fen: currentFen, depth: 10, movetime: 1500, multipv: 1 },
        ]
      ),
      runEngineWithFallbacks(
        { fen: previousFen, depth: safeDepth, movetime, multipv: requestedMultiPv },
        [
          { fen: previousFen, depth: Math.max(10, safeDepth - 2), movetime, multipv: Math.min(3, requestedMultiPv) },
          { fen: previousFen, depth: 10, movetime: 1500, multipv: 1 },
        ]
      ),
    ]);

    const currentResult = currentSettled.status === 'fulfilled' ? currentSettled.value : null;
    const previousResult = previousSettled.status === 'fulfilled' ? previousSettled.value : null;

    const turnToken = String(currentFen).trim().split(/\s+/)[1];
    const currentTurn = turnToken === 'b' ? 'b' : 'w';
    const whiteWin = scoreToWhiteWinProbability(currentResult?.score, currentTurn);

    const currentFallbackScore = { type: 'cp', value: 0 };
    const baseLines = Array.isArray(previousResult?.lines) ? previousResult.lines : [];
    const firstMoveScoreMap = await computeFirstMoveScores({
      previousFen,
      lines: baseLines,
      depth: safeDepth,
      movetime,
    });
    const responseLines = baseLines.map((line) => {
      const firstMove = String(line?.pv || '').trim().split(/\s+/)[0] || null;
      return {
        ...line,
        firstMoveScore: firstMove ? (firstMoveScoreMap[firstMove] || null) : null,
      };
    });
    const fallbackBestMoveFromLines = responseLines?.[0]?.pv ? responseLines[0].pv.split(' ')[0] : null;

    const warnings = [];
    if (currentSettled.status !== 'fulfilled') {
      warnings.push(`current analysis fallback failed: ${currentSettled.reason?.message || String(currentSettled.reason)}`);
    }
    if (previousSettled.status !== 'fulfilled') {
      warnings.push(`bestlines analysis fallback failed: ${previousSettled.reason?.message || String(previousSettled.reason)}`);
    }

    const response = {
      bestmove: currentResult?.bestmove || fallbackBestMoveFromLines || null,
      ponder: currentResult?.ponder || null,
      score: currentResult?.score || currentFallbackScore,
      depth: currentResult?.depth || 0,
      winProbability: {
        white: whiteWin,
        black: 100 - whiteWin,
      },
      lines: responseLines,
      previousFenBestmove:
        previousResult?.bestmove ||
        fallbackBestMoveFromLines,
      warning: warnings.length > 0 ? warnings : undefined,
    };

    console.log('[ANALYZE][OK]', response);
    res.json(response);
  } catch (e) {
    console.error('[ANALYZE][ERR]', e.message);
    res.status(500).json({ error: e.message });
  }
});

mountAnalysisHistoryRoutes(app);

app.post('/api/behavior/analyze', async (req, res) => {
  const { moves } = req.body || {};
  if (!Array.isArray(moves)) {
    return res.status(400).json({ error: 'moves array is required' });
  }

  const scriptPath = path.join(__dirname, 'behavioral_analysis.py');
  const inputJson = JSON.stringify(moves);

  const run = (cmd, cmdArgs, input) => {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, cmdArgs);
      let stdout = '';
      let stderr = '';
      
      if (input) {
        child.stdin.write(input);
        child.stdin.end();
      }

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code !== 0) {
          console.error('[BEHAVIOR]', 'process exited with code', code, stderr);
          reject(new Error(`Process exited with code ${code}: ${stderr}`));
          return;
        }
        try {
          const data = JSON.parse(stdout.trim());
          resolve(data);
        } catch (e) {
          console.error('[BEHAVIOR]', 'invalid json', stdout);
          reject(new Error('Invalid JSON from Behavior Analysis'));
        }
      });
    });
  };

  try {
    let result;
    try {
      result = await run(workingPython, [scriptPath, inputJson]);
    } catch (e) {
      const fallback = workingPython === 'python' ? 'py' : 'python';
      const fallbackArgs = workingPython === 'python' ? ['-3', scriptPath, inputJson] : [scriptPath, inputJson];
      result = await run(fallback, fallbackArgs);
    }
    res.json(result);
  } catch (e) {
    console.error('[BEHAVIOR][ERR]', e.message);
    res.status(500).json({ error: 'Behavior analysis failed', detail: e.message });
  }
});

app.post('/api/ml/predict', async (req, res) => {
  const inputData = req.body || {};
  const scriptPath = path.join(__dirname, 'predict_bridge.py');
  
  const run = (cmd, cmdArgs, inputJson) => {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, cmdArgs);
      let stdout = '';
      let stderr = '';
      
      if (inputJson) {
        child.stdin.write(inputJson);
        child.stdin.end();
      }

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code !== 0) {
          console.error('[ML-PREDICT]', 'process exited with code', code, stderr);
          reject(new Error(`Process exited with code ${code}: ${stderr}`));
          return;
        }
        try {
          const data = JSON.parse(stdout.trim());
          resolve(data);
        } catch (e) {
          console.error('[ML-PREDICT]', 'invalid json', stdout);
          reject(new Error('Invalid JSON from ML Bridge'));
        }
      });

      child.on('error', (err) => {
        console.error('[ML-PREDICT]', 'spawn error', err);
        reject(err);
      });
    });
  };

  try {
    let result;
    const inputJson = JSON.stringify(inputData);
    try {
      result = await run(workingPython, [scriptPath], inputJson);
    } catch (e) {
      const fallback = workingPython === 'python' ? 'py' : 'python';
      const fallbackArgs = workingPython === 'python' ? ['-3', scriptPath] : [scriptPath];
      try {
        result = await run(fallback, fallbackArgs, inputJson);
        workingPython = fallback; // Update successful command
      } catch (e2) {
        // Try python3 as last resort
        result = await run('python3', [scriptPath], inputJson);
        workingPython = 'python3';
      }
    }
    res.json(result);
  } catch (e) {
    console.error('[ML-PREDICT][ERR]', e.message);
    res.status(500).json({ error: 'Prediction failed', detail: e.message });
  }
});

app.post('/ai/pipeline', async (req, res) => {
  const { fen } = req.body || {};
  if (!fen) {
    return res.status(400).json({ error: 'fen is required' });
  }

  const scriptPath = path.join(__dirname, 'chess_pipeline.py');
  
  const run = (cmd, cmdArgs) => {
    return new Promise((resolve, reject) => {
      execFile(cmd, cmdArgs, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
          console.error('[PIPELINE]', 'exec error', error.message, stderr);
          reject(error);
          return;
        }
        try {
          const data = JSON.parse(stdout.trim());
          resolve(data);
        } catch (e) {
          console.error('[PIPELINE]', 'invalid json', stdout);
          reject(new Error('Invalid JSON from Pipeline'));
        }
      });
    });
  };

  try {
    let result;
    try {
      result = await run(workingPython, [scriptPath, fen]);
    } catch (e) {
      const fallback = workingPython === 'python' ? 'py' : 'python';
      const fallbackArgs = workingPython === 'python' ? ['-3', scriptPath, fen] : [scriptPath, fen];
      result = await run(fallback, fallbackArgs);
    }
    res.json(result);
  } catch (e) {
    console.error('[PIPELINE][ERR]', e.message);
    res.status(500).json({ error: 'Pipeline failed', detail: e.message });
  }
});

app.post('/api/book/check', async (req, res) => {
  const { moves } = req.body || {};
  if (!Array.isArray(moves)) {
    return res.status(400).json({ error: 'moves array is required' });
  }

  const scriptPath = path.join(__dirname, 'book_move_check.py');
  const movesJson = JSON.stringify(moves);

  const run = (cmd, cmdArgs) => new Promise((resolve, reject) => {
    execFile(cmd, cmdArgs, { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('[BOOK]', 'exec error', error.message, stderr);
        reject(error);
        return;
      }
      try {
        resolve(JSON.parse(String(stdout || '').trim() || '{}'));
      } catch (e) {
        console.error('[BOOK]', 'invalid json', stdout);
        reject(new Error('Invalid JSON from book checker'));
      }
    });
  });

  try {
    let result;
    try {
      result = await run(workingPython, [scriptPath, movesJson]);
    } catch {
      const fallback = workingPython === 'python' ? 'py' : 'python';
      const fallbackArgs = workingPython === 'python' ? ['-3', scriptPath, movesJson] : [scriptPath, movesJson];
      result = await run(fallback, fallbackArgs);
    }
    res.json(result);
  } catch (e) {
    console.error('[BOOK][ERR]', e.message);
    res.status(500).json({ error: 'Book checker failed', detail: e.message });
  }
});

app.post('/api/nlp/commentary', async (req, res) => {
  const inputData = req.body || {};
  const scriptPath = path.join(__dirname, 'nlp_commentary.py');
  
  const run = (cmd, cmdArgs, inputJson) => {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, cmdArgs);
      let stdout = '';
      let stderr = '';
      
      if (inputJson) {
        child.stdin.write(inputJson);
        child.stdin.end();
      }

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code !== 0) {
          console.error('[NLP-COMMENTARY]', 'process exited with code', code, stderr);
          reject(new Error(`Process exited with code ${code}: ${stderr}`));
          return;
        }
        try {
          const data = JSON.parse(stdout.trim());
          resolve(data);
        } catch (e) {
          console.error('[NLP-COMMENTARY]', 'invalid json', stdout);
          reject(new Error('Invalid JSON from NLP Commentary'));
        }
      });

      child.on('error', (err) => {
        console.error('[NLP-COMMENTARY]', 'spawn error', err);
        reject(err);
      });
    });
  };

  try {
    let result;
    const inputJson = JSON.stringify(inputData);
    try {
      result = await run(workingPython, [scriptPath], inputJson);
    } catch (e) {
      const fallback = workingPython === 'python' ? 'py' : 'python';
      const fallbackArgs = workingPython === 'python' ? ['-3', scriptPath] : [scriptPath];
      try {
        result = await run(fallback, fallbackArgs, inputJson);
        workingPython = fallback; // Update successful command
      } catch (e2) {
        // Try python3 as last resort
        result = await run('python3', [scriptPath], inputJson);
        workingPython = 'python3';
      }
    }
    res.json(result);
  } catch (e) {
    console.error('[NLP-COMMENTARY][ERR]', e.message);
    res.status(500).json({ error: 'Commentary generation failed', detail: e.message });
  }
});

// --- PERSISTENT FLAN-T5 PROCESS ---
let flanT5Process = null;
let flanT5Ready = false;
let flanT5Requests = [];

function startFlanT5(pythonCmd = workingPython) {
  const scriptPath = path.join(__dirname, 'flan_t5_bridge.py');
  console.log(`[FLAN-T5] Starting with ${pythonCmd}...`);
  flanT5Process = spawn(pythonCmd, [scriptPath]);
  
  flanT5Process.on('error', (err) => {
    console.error('[FLAN-T5] Spawn error:', err.message);
    if (pythonCmd === 'python') {
      console.log('[FLAN-T5] Retrying with py...');
      startFlanT5('py');
    } else if (pythonCmd === 'py') {
      console.log('[FLAN-T5] Retrying with python3...');
      startFlanT5('python3');
    }
  });

  flanT5Process.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      if (line.trim() === 'READY') {
        flanT5Ready = true;
        console.log('[FLAN-T5] Model is ready');
        continue;
      }
      
      try {
        const result = JSON.parse(line);
        if (flanT5Requests.length > 0) {
          const { resolve } = flanT5Requests.shift();
          resolve(result);
        }
      } catch (e) {
        console.error('[FLAN-T5] JSON parse error:', line);
      }
    }
  });

  flanT5Process.stderr.on('data', (data) => {
    console.error('[FLAN-T5][DEBUG]', data.toString().trim());
  });

  flanT5Process.on('close', (code) => {
    console.warn('[FLAN-T5] Process closed with code', code);
    flanT5Ready = false;
    // Restart after a delay
    setTimeout(startFlanT5, 5000);
  });
}

startFlanT5();

app.post('/api/flan-t5/generate', async (req, res) => {
  const { text, classification, tactical, turn, book_move_name } = req.body || {};
  if (!text) {
    return res.status(400).json({ error: 'text is required' });
  }

  if (!flanT5Ready) {
    return res.status(503).json({ error: 'Flan-T5 model is still loading' });
  }

  try {
    const promise = new Promise((resolve) => {
      flanT5Requests.push({ resolve });
      flanT5Process.stdin.write(JSON.stringify({ text, classification, tactical, turn, book_move_name }) + '\n');
    });
    
    // Timeout if it takes too long
    const result = await Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Flan-T5 Timeout')), 10000))
    ]);
    
    res.json(result);
  } catch (e) {
    console.error('[FLAN-T5][ERR]', e.message);
    res.status(500).json({ error: 'Flan-T5 generation failed', detail: e.message });
  }
});

app.get('/api/db/health', (req, res) => {
  try {
    const row = db.prepare('SELECT COUNT(*) AS sessions FROM analysis_sessions').get();
    res.json({ ok: true, dbPath, sessions: row.sessions });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
  console.log(`SQLite database: ${dbPath}`);
});

if (process.env.RUN_SELFTEST === '1') {
  runEngineDirect({ fen: 'startpos', depth: 8 })
    .then((r) => console.log(JSON.stringify(r)))
    .catch((e) => console.error(e.message));
}
