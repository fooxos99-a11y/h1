import { compareQuranPositionInDirection as compare } from '../../shared/quran-execution-policy.js';

// These are the two sources read when checking a student's prior memorization.
const sources = [
  { table: 'student_quran_plan_prior_memorization', ownerColumn: 'plan_id', ownerAlias: 'planId' },
  { table: 'student_quran_prior_memorization', ownerColumn: 'source', ownerAlias: 'source' },
];

const position = (range, prefix) => ({
  page: Number(range[`${prefix}Page`]), surah: Number(range[`${prefix}Surah`]), ayah: Number(range[`${prefix}Ayah`]),
});

async function saveRemainder(connection, source, row, studentId, start, end) {
  await connection.query(`INSERT INTO ${source.table}
    (${source.ownerColumn}, student_id, start_surah, start_ayah, start_page, end_surah, end_ayah, end_page)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  [row[source.ownerAlias], studentId, start.surah, start.ayah, start.page, end.surah, end.ayah, end.page]);
}

async function removeFromSource(connection, source, studentId, start, end, getAdjacentAyah) {
  const [rows] = await connection.query(`SELECT id, ${source.ownerColumn} AS ${source.ownerAlias},
      start_surah AS startSurah, start_ayah AS startAyah, start_page AS startPage,
      end_surah AS endSurah, end_ayah AS endAyah, end_page AS endPage
    FROM ${source.table}
    WHERE student_id = ?
      AND (start_page < ? OR (start_page = ? AND start_surah < ?)
        OR (start_page = ? AND start_surah = ? AND start_ayah <= ?))
      AND (end_page > ? OR (end_page = ? AND end_surah > ?)
        OR (end_page = ? AND end_surah = ? AND end_ayah >= ?))
    FOR UPDATE`,
  [studentId, end.page, end.page, end.surah, end.page, end.surah, end.ayah,
    start.page, start.page, start.surah, start.page, start.surah, start.ayah]);
  if (!rows.length) return 0;

  await connection.query(`DELETE FROM ${source.table}
    WHERE student_id = ? AND id IN (${rows.map(() => '?').join(',')})`, [studentId, ...rows.map(row => row.id)]);
  for (const row of rows) {
    const rowStart = position(row, 'start');
    const rowEnd = position(row, 'end');
    if (compare(rowStart, start) < 0) {
      const leftEnd = await getAdjacentAyah(connection, start, 'previous');
      if (leftEnd && compare(rowStart, leftEnd) <= 0) {
        await saveRemainder(connection, source, row, studentId, rowStart, leftEnd);
      }
    }
    if (compare(rowEnd, end) > 0) {
      const rightStart = await getAdjacentAyah(connection, end, 'next');
      if (rightStart && compare(rightStart, rowEnd) <= 0) {
        await saveRemainder(connection, source, row, studentId, rightStart, rowEnd);
      }
    }
  }
  return rows.length;
}

// The caller owns the transaction so both sources and their remainders change atomically.
// Teacher-approved recitations are separate records and are never changed here.
export async function removePriorMemorizationRange(connection, studentId, start, end, getAdjacentAyah) {
  let removed = 0;
  for (const source of sources) {
    removed += await removeFromSource(connection, source, studentId, start, end, getAdjacentAyah);
  }
  return removed;
}
