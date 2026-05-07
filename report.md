# Chess Project Detailed Report

## 1) Project Overview

This repository is a full-stack chess analysis platform that combines:

- A React frontend for board interaction, move navigation, and rich analytics UI.
- A Node.js backend that orchestrates Stockfish, SQLite session persistence, and Python AI/ML services.
- Multiple Python services for position feature extraction, move-quality ML prediction, behavioral scoring, and text generation.
- A local Stockfish engine build under `stockfish/`.
- A model/training workspace under `model/`.

Primary user flow:

1. Load or paste PGN in the frontend.
2. Frontend builds move timeline and requests backend analysis for each ply.
3. Backend uses Stockfish to evaluate current and previous FEN positions.
4. Frontend requests pipeline + ML predictions + commentary services.
5. Results are shown live in sidebars/tables and persisted to SQLite.
6. Sessions can be reopened later and exported to Excel.

---

## 2) Repository Structure (High-Level)

- `frontend/`
  - React + Vite app, routing, board UI, sidebars, history page, export utilities.
- `backend/`
  - Express API server, Stockfish orchestration, Python bridge processes, DB routes.
  - `db/` contains SQLite bootstrap + schema.
  - `routes/analysisHistory.js` contains session/move persistence APIs.
- `model/`
  - Data preprocessing and model training/evaluation scripts.
- `stockfish/`
  - Stockfish source and binaries used by backend engine integration.

---

## 3) Frontend Deep Dive

### 3.1 Entry and Routing

Main entry in `frontend/src/main.jsx`:

- Creates router with `Layout` shell.
- Routes:
  - `/` -> `Analyze`
  - `/analyze` -> `Analyze`
  - `/history` -> `AnalysisHistoryPage`

`frontend/src/Layout.jsx`:

- Hosts responsive shell with collapsible side navigation.
- Manages mobile overlay/open-close and desktop collapsed state in `localStorage`.
- Renders current route via `<Outlet />`.

### 3.2 Core Analyze Screen

Main page: `frontend/src/Analyze.jsx`.

Responsibilities:

- Uses `useChessGame` hook for all chess state, analysis queues, and pipeline/ML data.
- Renders:
  - Header actions (copy CSV, export Excel, progress).
  - Left sidebar (move list + summary stats).
  - Main board + eval bar + player badges.
  - Right sidebar (engine lines and evaluation graph).
  - Data/behavior/story/commentary panel (`DataPipelineTable`).
- Triggers extra NLP/Flan-T5 commentary calls per current move.
- Persists analyzed move rows into DB session endpoints.
- Supports restoring a saved session through `?session=<id>` query param.

### 3.3 Chess State Engine in Frontend (`useChessGame`)

File: `frontend/src/hooks/useChessGame.js`.

This is the client-side orchestration center:

- Maintains board state (`position`, `turn`, castling rights, en passant target).
- Parses PGN to:
  - `history` (SAN/UCI/clocks per move),
  - `timeline` (position snapshot per ply).
- Maintains analysis arrays by ply:
  - `analysis` (Stockfish result),
  - `pipelineData` (Python positional tables),
  - `mlInputs`/`mlOutputs` (ML feature+prediction payloads).
- Uses sequential worker queues:
  - Analysis queue (`/api/analyze` + `/ai/pipeline`).
  - ML queue (`/api/ml/predict`) only after analysis+pipeline are ready.
- Book opening tracking:
  - Calls `/api/book/check` incrementally by prefix move list.
  - Stores `bookStatusByPly`, first non-book ply.
- Provides utility values to UI:
  - Eval bar percentage,
  - best moves list,
  - played move eval,
  - legal move count,
  - move classifications.

### 3.4 Data/Insights Panel

Component: `frontend/src/components/DataPipelineTable.jsx`.

Displays:

- Flan-T5 refinement text.
- Generated commentary text.
- Behavioral 8-dimension score dashboard:
  - Patience, Consistency, Adaptability, Focus, MentalStability, TimeManagement, Creativity, Aggression.
- Story section produced from behavioral profile (`/api/behavior/stories`).

Also fetches `/ai/pipeline` directly for current FEN (in addition to hook-level storage logic), then renders table-driven data.

### 3.5 Sidebars

- `LeftSidebar.jsx`
  - Move history list with classification icon and clocks.
  - PGN paste/load panel.
  - Aggregate class-count summary (white vs black).
- `RightSidebar.jsx`
  - Current eval, win-probability text, best lines.
  - Played move rank/standing among candidate lines.
  - Final classification merging engine + ML signal.
  - Evaluation graph.
- `SideNavBar.jsx`
  - Navigation between Analyze and History routes.

### 3.6 Session History UI

`frontend/src/pages/AnalysisHistoryPage.jsx`:

- Lists saved sessions from `/api/sessions`.
- Expand to preview saved move rows.
- Open selected session back in analyzer.
- Export a session to Excel from saved move rows.
- Delete sessions.

---

## 4) Backend Deep Dive

Main backend server: `backend/index.js`.

### 4.1 Core Stack

- Express + CORS + JSON body parsing.
- Request/response logging middleware.
- OpenAI SDK for story generation endpoint.
- SQLite module from `node:sqlite` via `DatabaseSync`.
- Child process management (`spawn`, `execFile`) for Python services and Stockfish.

### 4.2 Stockfish Integration

`PersistentStockfish` class:

- Starts one long-running Stockfish process instead of spawning per request.
- Sends UCI commands (`uci`, `isready`, `position`, `go`).
- Parses streamed output lines until `bestmove`.
- Supports queueing multiple requests serially.
- Handles timeout and fallback attempts.

Two instances are created:

- Main engine for normal calls.
- Background engine for extra first-move line scoring.

### 4.3 `/api/analyze` Endpoint (Critical)

Input:

- `current_fen`, `previous_fen`, optional `multipv`, depth/movetime options.

Flow:

1. Validates both FENs.
2. Checks in-memory cache.
3. Runs Stockfish on:
   - `current_fen` for played move eval context.
   - `previous_fen` with MultiPV for alternatives.
4. Computes white win probability mapping.
5. For each candidate line, computes first-move follow-up score with tiered times.
6. Returns merged payload:
   - bestmove, score, depth, winProbability, lines, previousFenBestmove, warnings.

### 4.4 Python Service Endpoints

- `/ai/pipeline`
  - Uses persistent `chess_pipeline.py` process.
  - Returns table bundle (`t1`..`t16`) and summarized board-state descriptors.

- `/api/ml/predict`
  - Uses persistent `predict_bridge.py` process.
  - Returns:
    - `inputs` (post-preprocess features),
    - `predictions` (currently only `pipeline1` class3/class8).

- `/api/nlp/commentary`
  - Runs `nlp_commentary.py` per request.
  - Builds variable-style sentence commentary from move features.

- `/api/flan-t5/generate`
  - Uses persistent `flan_t5_bridge.py`.
  - Applies stylistic one-line refinement on commentary text.

- `/api/behavior/analyze`
  - Runs `behavioral_analysis.py` with move-level summary rows.
  - Returns 8 behavioral percentages.

- `/api/book/check`
  - Runs `book_move_check.py` using Openix opening library.
  - Returns is-book status + opening name + candidate next book moves.

- `/api/behavior/stories`
  - Reads `behavioral_stories` table.
  - Finds nearest story via Euclidean distance on 8 behavior dimensions.
  - Calls OpenAI to generate kid-friendly Panchatantra-style targeted story.

### 4.5 Session History Routes

Mounted via `mountAnalysisHistoryRoutes(app)`:

- `POST /api/sessions` create session.
- `PATCH /api/sessions/:id` update progress/status.
- `POST /api/sessions/:id/moves` upsert per-ply export row.
- `GET /api/sessions` list sessions.
- `GET /api/sessions/:id` session details.
- `GET /api/sessions/:id/moves` all saved move rows.
- `DELETE /api/sessions/:id` delete session and child rows.

Upsert behavior ensures a single canonical row per `(session_id, ply_index)`.

---

## 5) Database Design

DB bootstrap in `backend/db/database.js`.

Database path:

- `backend/data/chess_analysis.db`

Setup behavior:

- Creates `data/` folder if missing.
- Enables WAL journal mode and foreign keys.
- Executes schema from `backend/db/schema.sql`.
- Runs lightweight migrations for added/dropped columns.

### 5.1 Tables

1. `analysis_sessions`
   - Session metadata, PGN, progress counters, status.

2. `analysis_move_rows`
   - Very wide denormalized row for each ply.
   - Includes move info, evals, pipeline signals, generated texts, multipv slots, raw JSON snapshots.

3. `behavioral_stories`
   - Story templates and behavior dimension values for nearest-profile matching.

---

## 6) Python Modules Explained

### 6.1 `chess_pipeline.py`

Purpose:

- Convert FEN into structured tactical/strategic numeric+categorical descriptors.

Returns:

- Top-level summaries (`game_phase`, `king_safety`, etc.).
- `tables.t1..t16` including:
  - geometry, material, king safety, pawn structure, activity/mobility, control, tactics, practical risk, strategic synthesis.

### 6.2 `predict_bridge.py`

Purpose:

- Persistent inference server around model package.

Behavior:

- Reads JSON lines from stdin.
- Calls `predict` + preprocessing in `model`.
- Emits JSON per request.
- Currently limits output to `pipeline1`.

### 6.3 `behavioral_analysis.py`

Purpose:

- Compute behavior traits from move-by-move metrics.

Method:

- Derives error and timing distributions.
- Computes formulas for patience/consistency/adaptability/focus/etc.
- Normalizes each to 0-100.

### 6.4 `nlp_commentary.py`

Purpose:

- Lightweight dynamic commentary generator.

Method:

- Template pools by phase/classification.
- NLTK POS usage for slight linguistic variation.
- Adds coaching/position context hints.

### 6.5 `flan_t5_bridge.py`

Purpose:

- Uses `google/flan-t5-small` to produce short stylistic one-line opponent-tone text.

Behavior:

- Loads once, then serves line-delimited JSON requests.
- Applies output guards (length/quality fallbacks).

### 6.6 `book_move_check.py`

Purpose:

- Detect whether SAN prefix is in opening book.

Behavior:

- Uses Openix library.
- Returns opening metadata and possible book continuations.

---

## 7) ML Workspace (`model/`)

### 7.1 Training

`model/train.py`:

- Loads `cleaned_chess_data.csv`.
- Preprocesses via `preprocess.py`.
- Trains three 2-stage pipelines:
  - Pipeline1: XGB -> RandomForest
  - Pipeline2: XGB -> XGB
  - Pipeline3: XGB -> GradientBoosting
- Saves models + label encoders to `model/models/`.

### 7.2 Research/Experiment Script

`model/final_modelling.py`:

- Exploratory/iterative notebook-style script.
- Performs cleaning, feature engineering, multi-split training experiments, and metric printing.

---

## 8) End-to-End Runtime Sequence (Step-by-Step)

### Step 1: App startup

1. Frontend starts Vite dev server.
2. Backend starts Express server.
3. Backend boots SQLite and migrations.
4. Backend spawns persistent processes:
   - Stockfish engine(s),
   - `predict_bridge.py`,
   - `chess_pipeline.py`,
   - `flan_t5_bridge.py`.

### Step 2: User loads PGN

1. User pastes/loads PGN in left sidebar.
2. `useChessGame` parses PGN to history + timeline with clocks and FEN-related state.
3. Frontend creates analysis session (`POST /api/sessions`).

### Step 3: Per-ply analysis queue

1. Hook pushes missing plies into `analysisQueue`.
2. Worker processes one ply at a time:
   - Calls `/api/analyze` with current+previous FEN.
   - Calls `/ai/pipeline` with FEN.
3. Results written into `analysis[idx]` and `pipelineData[idx]`.

### Step 4: Per-ply ML queue

1. Once both analysis and pipeline exist for a ply, it enters `mlQueue`.
2. Worker sends engineered payload to `/api/ml/predict`.
3. Feature and prediction payloads stored into `mlInputs[idx]` and `mlOutputs[idx]`.

### Step 5: Commentary and behavioral generation

1. Analyze page aggregates rich move context into `allMoveInputs`.
2. For current nav move:
   - Calls `/api/nlp/commentary`.
   - Then calls `/api/flan-t5/generate`.
3. Behavior scores computed via `/api/behavior/analyze`.
4. At 100% analysis, story request sent to `/api/behavior/stories`.

### Step 6: Persistence loop

1. Analyze page builds export-aligned row for each analyzed ply.
2. Upserts row to `/api/sessions/:id/moves`.
3. Patches session progress counters and completion status.

### Step 7: Review and export

1. History page lists sessions and previews move rows.
2. User can reopen a session in Analyze (`?session=<id>`).
3. User can export to Excel from active analysis or saved session.

---

## 9) Key APIs (Quick Reference)

- `GET /api/hello`
- `POST /api/analyze`
- `POST /ai/pipeline`
- `POST /api/ml/predict`
- `POST /api/book/check`
- `POST /api/nlp/commentary`
- `POST /api/flan-t5/generate`
- `POST /api/behavior/analyze`
- `POST /api/behavior/stories`
- `GET /api/db/health`
- Session APIs under `/api/sessions`

---

## 10) Configuration and Dependencies

### Backend

- Runtime: Node CommonJS.
- Main deps: `express`, `cors`, `dotenv`, `openai`, `xlsx`.
- Requires:
  - Python environment with required packages (`python-chess`, pandas/numpy, nltk, transformers, torch, etc.).
  - Stockfish binary expected at `stockfish/stockfish-windows-x86-64-avx2.exe`.
  - OpenAI key for story endpoint (`OPENAI_API_KEY`).

### Frontend

- Runtime: React + Vite.
- Main deps: `chess.js`, `react-chessboard`, `react-router-dom`, `react-markdown`, `xlsx`.
- Backend URL:
  - `VITE_API_URL` or fallback `http://localhost:5000`.

---

## 11) Important Design Notes and Tradeoffs

- Strengths:
  - Strong end-to-end integration (engine + strategy + ML + NLP + persistence).
  - Robust session recovery and incremental persistence.
  - Rich, denormalized dataset for export and downstream analysis.

- Tradeoffs / Risks:
  - Multiple long-lived child processes increase operational complexity.
  - Large, monolithic frontend pages/hooks can be hard to maintain.
  - Very wide DB table simplifies export but reduces normalization clarity.
  - Some services are sync-like with timeouts and could block under heavy load.

---

## 12) How To Run (Practical)

1. Install frontend dependencies in `frontend/`.
2. Install backend dependencies in `backend/`.
3. Ensure Python dependencies are installed for all backend scripts.
4. Ensure Stockfish executable path exists as expected.
5. Set backend env variables (`OPENAI_API_KEY`, optional `OPENAI_MODEL`, optional `PORT`).
6. Start backend (`npm start` in `backend`).
7. Start frontend (`npm run dev` in `frontend`).
8. Open app, load PGN, and monitor analysis progress.

---

## 13) Final Summary

This project is a comprehensive chess analysis platform that goes beyond engine scores. It combines:

- Classic engine evaluation (Stockfish),
- Position feature extraction (pipeline tables),
- ML-based move quality labeling,
- Behavioral profiling and story generation,
- Persistent session storage and export tooling.

The architecture is feature-rich and already close to an analysis product framework rather than a simple chess board demo.
