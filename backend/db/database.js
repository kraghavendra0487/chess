const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'chess_analysis.db');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

const schemaPath = path.join(__dirname, 'schema.sql');
db.exec(fs.readFileSync(schemaPath, 'utf8'));

function migrateAddCommentaryColumns() {
  const cols = db.prepare(`PRAGMA table_info('analysis_move_rows')`).all();
  const hasCommentary = cols.some((c) => c?.name === 'generated_commentary');
  const hasFlan = cols.some((c) => c?.name === 'flan_t5_output');
  
  if (!hasCommentary) {
    try {
      db.exec(`ALTER TABLE analysis_move_rows ADD COLUMN generated_commentary TEXT;`);
    } catch (e) {
      console.warn('[db][migrate] add generated_commentary failed:', e.message);
    }
  }
  
  if (!hasFlan) {
    try {
      db.exec(`ALTER TABLE analysis_move_rows ADD COLUMN flan_t5_output TEXT;`);
    } catch (e) {
      console.warn('[db][migrate] add flan_t5_output failed:', e.message);
    }
  }
}

migrateAddCommentaryColumns();

function migrateDropSacrificesColumn() {
  // SQLite can't DROP COLUMN; rebuild table if legacy column exists.
  const cols = db.prepare(`PRAGMA table_info('analysis_move_rows')`).all();
  const hasSacrifices = cols.some((c) => c?.name === 'sacrifices');
  if (!hasSacrifices) return;

  const existingNames = cols.map((c) => c.name).filter(Boolean);
  const keepNames = existingNames.filter((n) => n !== 'sacrifices');

  // Keep original order; ensure required keys exist.
  if (!keepNames.includes('id') || !keepNames.includes('session_id') || !keepNames.includes('ply_index')) {
    return;
  }

  const colList = keepNames.join(', ');

  db.exec('BEGIN;');
  try {
    db.exec(`ALTER TABLE analysis_move_rows RENAME TO analysis_move_rows_old;`);
    // Recreate using updated schema.sql (already executed above, but table name is now free).
    db.exec(fs.readFileSync(schemaPath, 'utf8'));
    db.exec(`INSERT INTO analysis_move_rows (${colList}) SELECT ${colList} FROM analysis_move_rows_old;`);
    db.exec(`DROP TABLE analysis_move_rows_old;`);
    db.exec('COMMIT;');
  } catch (e) {
    try { db.exec('ROLLBACK;'); } catch {}
    // If migration fails, keep old table so app can still run.
    try {
      const t = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='analysis_move_rows_old'`).get();
      if (t) {
        db.exec(`ALTER TABLE analysis_move_rows_old RENAME TO analysis_move_rows;`);
      }
    } catch {}
    console.warn('[db][migrate] drop sacrifices failed:', e?.message || String(e));
  }
}

migrateDropSacrificesColumn();

function migrateDropTempoColumn() {
  // SQLite can't DROP COLUMN; rebuild table if legacy column exists.
  const cols = db.prepare(`PRAGMA table_info('analysis_move_rows')`).all();
  const hasTempo = cols.some((c) => c?.name === 'tempo');
  if (!hasTempo) return;

  const existingNames = cols.map((c) => c.name).filter(Boolean);
  const keepNames = existingNames.filter((n) => n !== 'tempo');

  if (!keepNames.includes('id') || !keepNames.includes('session_id') || !keepNames.includes('ply_index')) {
    return;
  }

  const colList = keepNames.join(', ');

  db.exec('BEGIN;');
  try {
    db.exec(`ALTER TABLE analysis_move_rows RENAME TO analysis_move_rows_old;`);
    db.exec(fs.readFileSync(schemaPath, 'utf8'));
    db.exec(`INSERT INTO analysis_move_rows (${colList}) SELECT ${colList} FROM analysis_move_rows_old;`);
    db.exec(`DROP TABLE analysis_move_rows_old;`);
    db.exec('COMMIT;');
  } catch (e) {
    try { db.exec('ROLLBACK;'); } catch {}
    try {
      const t = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='analysis_move_rows_old'`).get();
      if (t) {
        db.exec(`ALTER TABLE analysis_move_rows_old RENAME TO analysis_move_rows;`);
      }
    } catch {}
    console.warn('[db][migrate] drop tempo failed:', e?.message || String(e));
  }
}

migrateDropTempoColumn();

function migrateAddBestLineDeltaColumn() {
  const cols = db.prepare(`PRAGMA table_info('analysis_move_rows')`).all();
  const has = cols.some((c) => c?.name === 'best_line_delta');
  if (has) return;
  try {
    db.exec(`ALTER TABLE analysis_move_rows ADD COLUMN best_line_delta TEXT;`);
  } catch (e) {
    console.warn('[db][migrate] add best_line_delta failed:', e?.message || String(e));
  }
}

migrateAddBestLineDeltaColumn();

function migrateAddMLColumns() {
  const cols = db.prepare(`PRAGMA table_info('analysis_move_rows')`).all();
  const hasInputs = cols.some((c) => c?.name === 'ml_inputs_json');
  const hasPredictions = cols.some((c) => c?.name === 'ml_predictions_json');
  
  if (!hasInputs) {
    try {
      db.exec(`ALTER TABLE analysis_move_rows ADD COLUMN ml_inputs_json TEXT;`);
    } catch (e) {
      console.warn('[db][migrate] add ml_inputs_json failed:', e?.message || String(e));
    }
  }
  
  if (!hasPredictions) {
    try {
      db.exec(`ALTER TABLE analysis_move_rows ADD COLUMN ml_predictions_json TEXT;`);
    } catch (e) {
      console.warn('[db][migrate] add ml_predictions_json failed:', e?.message || String(e));
    }
  }

  const hasPipeline = cols.some((c) => c?.name === 'pipeline_json');
  if (!hasPipeline) {
    try {
      db.exec(`ALTER TABLE analysis_move_rows ADD COLUMN pipeline_json TEXT;`);
    } catch (e) {
      console.warn('[db][migrate] add pipeline_json failed:', e?.message || String(e));
    }
  }
}

migrateAddMLColumns();

function migrateCreateBehavioralStoriesTable() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  db.exec(fs.readFileSync(schemaPath, 'utf8'));
}

migrateCreateBehavioralStoriesTable();

function touchSessionUpdatedAt(sessionId) {
  db.prepare(
    `UPDATE analysis_sessions SET updated_at = datetime('now') WHERE id = ?`
  ).run(sessionId);
}

module.exports = {
  db,
  dbPath,
  touchSessionUpdatedAt,
};
