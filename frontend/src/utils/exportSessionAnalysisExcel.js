import * as XLSX from 'xlsx';
import { EXPORT_HEADERS } from './analysisExportHeaders';
import { ANALYSIS_ROW_CELL_KEYS } from './analysisDbRowKeys';

/**
 * @param {number} sessionId
 * @param {object[]} moves rows from GET /api/sessions/:id/moves
 * @param {string} [filename]
 */
export function downloadSessionAnalysisExcel(sessionId, moves, filename) {
  const sorted = [...(moves || [])].sort((a, b) => (a.ply_index ?? 0) - (b.ply_index ?? 0));
  const dataRows = sorted.map((m) =>
    ANALYSIS_ROW_CELL_KEYS.map((k) => (m[k] != null && m[k] !== '' ? String(m[k]) : ''))
  );
  const ws = XLSX.utils.aoa_to_sheet([EXPORT_HEADERS, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Chess Analysis');
  const name =
    filename || `Chess_Analysis_Session_${sessionId}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, name);
}
