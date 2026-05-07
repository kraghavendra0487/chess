# NLP Report - Chess Project

## 1) Abstract / Introduction

This report explains the NLP pipeline used in the chess project and the full context required before NLP is even possible.  
In this system, NLP is not standalone. It sits in the middle of a larger analysis chain:

1. Chess game ingestion (PGN parsing, timeline construction, move metadata extraction).
2. Engine evaluation and strategic pipeline generation.
3. ML and behavioral enrichment.
4. NLP commentary generation.
5. Flan-T5 style refinement.
6. AI story generation based on long-term behavioral profile.

The core design idea is:

- **Deterministic chess intelligence first** (engine, feature tables, model outputs),
- **Language generation second** (NLP + Flan-T5 + story AI).

So the quality of language output depends heavily on prerequisites prepared in upstream modules.

---

## 2) Prerequisites Before NLP (What Was Done First)

This section explains all prerequisites completed before calling NLP.

### 2.1 Frontend State Preparation

From `frontend/src/hooks/useChessGame.js` and `frontend/src/Analyze.jsx`:

- PGN is parsed into:
  - `history` (SAN/UCI/color/clock)
  - `timeline` (board state per ply)
- Every move has positional context:
  - FEN before and after move
  - Side to move
  - Move number and turn label

Without this, NLP would have no accurate game context.

### 2.2 Stockfish Analysis Prerequisite

From backend endpoint `POST /api/analyze`:

- Engine computes:
  - current position score
  - previous position multipv candidate lines
  - best move
  - win probability
  - first-move follow-up scores for alternatives

These are essential because NLP text references move quality and alternatives (best vs played).

### 2.3 Positional Pipeline Prerequisite (`/ai/pipeline`)

From `backend/chess_pipeline.py`:

- Structured chess descriptors are generated:
  - game phase
  - king safety
  - tactical motifs (pins/forks/SEE losses)
  - space dominance
  - mobility
  - material and pawn structure

NLP consumes these as semantic signals to produce meaningful commentary instead of generic sentences.

### 2.4 Move Classification + Standing Prerequisite

Frontend computes:

- Played move class (`best`, `excellent`, `good`, `inaccuracy`, `mistake`, `blunder`, `book`)
- Played move standing among legal moves
- Delta vs best line

This classification drives tone and criticality in commentary.

### 2.5 ML and Behavioral Prerequisite (Indirect)

ML outputs and behavioral insights are generated in parallel:

- `/api/ml/predict` (class3/class8 model output)
- `/api/behavior/analyze` (8 behavior scores)

Even when not directly injected into one NLP request, they shape overall analysis presentation and later AI narrative components.

### 2.6 Aggregated NLP Input Object

In `Analyze.jsx`, all move-level signals are merged into `allMoveInputs[]`, per ply.  
This is the immediate payload source for `/api/nlp/commentary`.

So the final NLP call only happens after significant structured analysis has already been completed.

---

## 3) NLP Core Section (Main Focus)

This is the primary mid-section: how NLP is built, what goes in, what prompt logic it follows, and what comes out.

### 3.1 NLP Endpoint and Runtime

- Endpoint: `POST /api/nlp/commentary`
- Backend script: `backend/nlp_commentary.py`
- Execution model: spawned Python process per request (stdin JSON -> stdout JSON)

The endpoint receives rich move context JSON and returns a generated commentary sentence/paragraph block.

### 3.2 NLP Inputs (Detailed)

Primary input fields assembled in frontend before request:

- `move` (SAN, e.g. `Nf3`, `exd5`)
- `english_move` (human-readable move phrase)
- `turn` (`White` or `Black`)
- `classification` (move quality class)
- `book_move_name` (opening name if available)
- `played_eval`
- `eval_before`
- `best_engine` (best UCI from engine lines)
- `best_move_san`
- `best_eval`
- `top_3_next_moves` (move/eval/classification tuples)
- `game_phase` (`opening`, `middlegame`, `endgame`)
- `tactical_classification`
- `king_safety`
- `space_dominance`
- `mobility`

This is strong because NLP is fed with both **quantitative** and **symbolic** chess context.

### 3.3 NLP Prompt/Generation Logic (Inside `nlp_commentary.py`)

The script uses a rule/template + variation method:

1. **Phase-dependent openings**
   - Different leading phrases for opening/middlegame/endgame/default.
2. **Classification-driven tone**
   - Blunder/mistake/inaccuracy/good/excellent pools with different verbs and phrase banks.
3. **Alternative move mention**
   - If move is suboptimal and best SAN differs, script inserts "better was..." style text.
4. **Eval-based position status**
   - Uses played eval magnitude to describe balance/advantage.
5. **Coaching hint injection**
   - Adds short educational hint depending on severity.
6. **Surface-level NLP variation**
   - NLTK tokenization/POS tagging applied (also acts as language utility layer).

The result is not a pure LLM generation; it is **guided semi-structured NLG** with controlled variation.

**Important clarification:** yes, this is a **rule-based NLP layer** (template + condition rules + lexical pools), not a pure end-to-end neural language model.

### 3.4 NLP Output Format

Returned JSON from NLP script:

- `commentary` (main generated text)
- `pos_tags` (tag output from NLTK internals)
- `classification` (normalized class label)

Frontend stores it in `enhancedCommentaries[navIndex]` and displays it in data panel.

### 3.5 Why This NLP Design Works

Advantages:

- Stable and explainable output.
- Lower hallucination risk than free-form LLM only.
- Fast enough for per-move invocation.
- Strongly grounded in chess metrics.

Limitations:

- Template structure can still sound repetitive over long games.
- Quality depends on upstream signal quality.
- Tone depth is bounded by phrase bank and rules.

### 3.6 Rule-Based NLP Examples (With Concrete Input/Output)

Below are representative examples of how the rule-based NLP behaves.

#### Example A - Blunder case

Input (simplified):

```json
{
  "move": "Qh5",
  "turn": "White",
  "classification": "blunder",
  "best_move_san": "Nf3",
  "played_eval": "-3.20",
  "game_phase": "middlegame"
}
```

Rule triggers:

- middlegame prefix pool selected
- blunder verb phrase selected
- "better was ..." path enabled because `best_move_san != move`
- severe eval swing language selected

Possible output:

`With the tension rising, White played Qh5. Qh5 blunders away decisive material. It's painful to watch, especially when Nf3 was available. The evaluation has swung violently. You could improve this by checking tactical threats and forcing responses before committing.`

#### Example B - Inaccuracy case

Input:

```json
{
  "move": "a3",
  "turn": "Black",
  "classification": "inaccuracy",
  "best_move_san": "d5",
  "played_eval": "0.30",
  "game_phase": "opening"
}
```

Rule triggers:

- opening prefix pool
- inaccuracy verb phrase
- alternative suggestion line included

Possible output:

`In the opening, Black played a3. Black overlooks a sharper continuation. Better was pawn to d5 as it improves the position significantly. The position remains balanced. Improving move precision will help you find stronger continuations in similar positions.`

#### Example C - Best move case

Input:

```json
{
  "move": "Nf3",
  "turn": "White",
  "classification": "best",
  "best_move_san": "Nf3",
  "played_eval": "+0.85",
  "game_phase": "opening"
}
```

Rule triggers:

- opening prefix
- strong positive phrase pool
- no "better was" line (same as best move)

Possible output:

`To start things off, White played Nf3. White executes great precision. The position remains advantageous for White. Excellent calculation and understanding of the position.`

#### Short code excerpt showing rule-based nature

```python
# backend/nlp_commentary.py
if classification in phrase_pools:
    verb = random.choice(phrase_pools[classification]["verbs"])
    phrase = random.choice(phrase_pools[classification]["phrases"])
    quality_variation = f"{turn} {verb} {phrase}"

if classification not in ["best", "excellent"] and best_move_san != "N/A" and best_move_san != san:
    better_alt = f"Better was {display_best} as it improves the position significantly."
```

---

## 4) Flan-T5 Layer (Post-NLP Refinement)

This is the second language stage after primary NLP.

### 4.1 Endpoint and Runtime

- Endpoint: `POST /api/flan-t5/generate`
- Script: `backend/flan_t5_bridge.py`
- Model: `google/flan-t5-small`
- Process mode: persistent Python process started at backend boot
- Readiness signaling: script prints `READY`, backend gates requests until ready

### 4.2 Flan-T5 Inputs

Backend receives:

- `text` (usually generated commentary from NLP stage)
- `classification`
- `tactical`
- `turn`
- `book_move_name`

These are compact style-control signals, not raw board tensors.

### 4.3 Flan-T5 Prompt Design

Prompt is an instruction-style template enforcing:

- second-person voice ("you")
- witty/sarcastic tone
- no long explanation
- single short sentence target

Generation settings:

- sampling enabled
- controlled temperature/top-k/top-p
- repetition penalty
- output guardrails/fallback replacements for bad outputs

### 4.4 Flan-T5 Output

JSON format:

- `success`
- `output` (short refined line)
- `error` (if failed)

Frontend stores this in `flanT5Outputs[navIndex]` and displays it above regular commentary in the UI.

### 4.5 Role of Flan-T5 in Pipeline

Flan-T5 is not replacing core commentary.  
It acts as a **style enhancer / surface realization layer**:

- NLP = factual/context-grounded sentence block
- Flan-T5 = compact expressive one-liner

### 4.6 Flan-T5 Examples (Input, Prompt Style, Output)

#### Example A - Blunder refinement

Input payload:

```json
{
  "text": "White played Qh5 and blundered decisive material.",
  "classification": "blunder",
  "tactical": "BLUNDER (Losing Material)",
  "turn": "White",
  "book_move_name": "N/A"
}
```

Prompt style (internal):

- force second-person ("you")
- witty/sarcastic
- one short sentence

Possible output:

`You hung everything in one move - brutal.`

#### Example B - Book move refinement

Input payload:

```json
{
  "text": "Black played Nf6 from known opening theory.",
  "classification": "book",
  "tactical": "NONE",
  "turn": "Black",
  "book_move_name": "Sicilian Defense"
}
```

Possible output:

`You followed theory; now prove you understand it.`

#### Short code excerpt for generation controls

```python
outputs = model.generate(
    **inputs,
    max_new_tokens=25,
    do_sample=True,
    temperature=0.6,
    top_k=50,
    top_p=0.9,
    repetition_penalty=1.2
)
```

---

## 5) "AI" Section (What All AI We Did)

You asked for "then for the AI". In this project, AI appears in multiple modules:

## 5.1 Engine AI (Stockfish)

- Provides tactical/positional truth baseline.
- Used for score, best moves, multipv alternatives, win probability mapping.

Example:

- Input: `current_fen`, `previous_fen`, `multipv=3`
- Output:
  - `score: {type: "cp", value: 48}`
  - `bestmove: "e2e4"`
  - `lines: [{pv: "...", score: ...}, ...]`

## 5.2 Feature AI / Chess Pipeline AI

- `chess_pipeline.py` transforms FEN into rich symbolic+numeric descriptors.
- Adds strategic abstraction over raw engine numbers.

Example:

- Input: FEN
- Output:
  - `tables.t5.white.attack_intensity`
  - `tables.t4.see_losses`
  - `game_phase`, `space_dominance`, `mobility`

## 5.3 Predictive ML AI

- `predict_bridge.py` serves trained models from `model/`.
- Produces class labels (`class3`, `class8`) from engineered features.
- Pipeline1 currently active in runtime.

Model details currently used in runtime:

- 2-stage Pipeline1:
  1. XGBoost for 3-class (`good`, `neutral`, `bad`)
  2. RandomForest for 8-class (best/excellent/good/book/inaccuracy/mistake/blunder/forced)

Example:

- Input features: move no, player, played standing, eval delta, legal moves, game phase, etc.
- Output:
  - `pipeline1.class3 = "bad"`
  - `pipeline1.class8 = "mistake"`

## 5.4 Behavioral AI

- `behavioral_analysis.py` computes 8 profile dimensions.
- Converts move quality and timing patterns into player-behavior metrics.

Example output:

```json
{
  "Patience": 62.4,
  "Consistency": 55.1,
  "Adaptability": 48.7,
  "Focus": 70.2,
  "MentalStability": 66.0,
  "TimeManagement": 58.9,
  "Creativity": 44.6,
  "Aggression": 73.3
}
```

## 5.5 Generative NLP AI

- `nlp_commentary.py` generates contextual natural language explanations.

Type:

- **Rule-based NLG + NLP utilities (NLTK)**, not a large foundation model.

## 5.6 Generative Text-Refinement AI

- `flan_t5_bridge.py` produces short human-like conversational refinement.

Type:

- **Neural seq2seq language model** (`google/flan-t5-small`).

## 5.7 Narrative Story AI (OpenAI)

- Endpoint `/api/behavior/stories` selects nearest behavioral story from DB.
- Then uses OpenAI chat completion to generate child-friendly targeted story:
  - focuses on weakest behavior dimensions
  - includes moral + chess insight + improvement hint

Current provider/model path:

- Provider: OpenAI API
- Model: `process.env.OPENAI_MODEL` or fallback `"gpt-4o-mini"`

Example output format:

- `Title`
- `Story` (120-180 words, no chess inside story body)
- `Moral`
- `Behavior Focus`
- `Chess Insight`
- `Behavior Improvement Insight`

So "AI" here is a **multi-layer stack**:

- deterministic engine intelligence,
- statistical prediction,
- behavior inference,
- natural language generation,
- instruction-following story generation.

### 5.8 Exactly What AI We Are Using (Final List)

1. **Stockfish 18** (classical chess engine AI)
2. **Custom ML models** from `model/`:
   - XGBoost
   - RandomForest
   - (other trained variants exist, runtime uses pipeline1)
3. **Rule-based NLP generator** (`nlp_commentary.py`) with NLTK utilities
4. **Flan-T5-small** (`google/flan-t5-small`) for style refinement
5. **OpenAI chat model** (`gpt-4o-mini` default, configurable) for behavioral story generation

---

## 6) End-to-End NLP-Centric Flow (Step-by-Step)

1. PGN loaded and parsed.
2. Stockfish + pipeline + ML data generated per ply.
3. Frontend aggregates move context into `allMoveInputs`.
4. `/api/nlp/commentary` called for current move.
5. NLP script returns contextual commentary text.
6. That text is sent to `/api/flan-t5/generate`.
7. Flan-T5 returns short refined line.
8. Both outputs are shown in UI and persisted in analysis rows (`generated_commentary`, `flan_t5_output` fields).

---

## 7) Overall Summary

This project's NLP is designed as a **middle intelligence layer**, not an isolated text toy.

- **Before NLP**, the system performs heavy chess reasoning and feature synthesis.
- **At NLP stage**, structured signals are converted to understandable language commentary.
- **After NLP**, Flan-T5 improves style and brevity, while broader AI modules (behavior + story generation) deliver long-range educational output.

In short:

- Upstream modules answer: **"What happened on the board?"**
- NLP answers: **"How do we explain that move naturally?"**
- Flan-T5 and story AI answer: **"How do we communicate it engagingly and personally?"**

This layered architecture is the key strength of the project's NLP design.
