import layout from '../data/quranVerseLineLayout.js';

const LINES_PER_FACE = 15;
const ranges = new Map();
for (const [key, page, line, endPage, endLine] of layout) {
  const surah = Number(key.split(':')[0]);
  const start = (page - 1) * LINES_PER_FACE + line;
  const end = (endPage - 1) * LINES_PER_FACE + endLine;
  const prior = ranges.get(surah);
  ranges.set(surah, { start: Math.min(prior?.start ?? start, start), end: Math.max(prior?.end ?? end, end) });
}
const bases = direction => {
  const result = new Map(); let offset = 0;
  for (const [surah, range] of [...ranges].sort((a,b) => direction * (a[0]-b[0]))) {
    result.set(surah, offset - range.start);
    offset += range.end - range.start + 1;
  }
  return result;
};
const ascending = bases(1), descending = bases(-1);
export const quranFacePositions = layout.map(([key,page,line,endPage,endLine]) => {
  const [surah,ayah] = key.split(':').map(Number);
  const start = (page-1)*LINES_PER_FACE+line, end = (endPage-1)*LINES_PER_FACE+endLine;
  return {surah,ayah,forwardStart:ascending.get(surah)+start,forwardEnd:ascending.get(surah)+end,reverseStart:descending.get(surah)+start,reverseEnd:descending.get(surah)+end};
});
const byAyah = new Map(quranFacePositions.map(row => [`${row.surah}:${row.ayah}`,row]));
// Surahs descend, but verses within each surah still run forwards.
export function descendingRecitationLines(start, end, startAfter = null) {
  const first = byAyah.get(`${Number(start?.surah)}:${Number(start?.ayah)}`);
  const last = byAyah.get(`${Number(end?.surah)}:${Number(end?.ayah)}`);
  const previous = startAfter && byAyah.get(`${Number(startAfter.surah)}:${Number(startAfter.ayah)}`);
  if (!first || !last || (startAfter && !previous)) return null;
  return Math.max(0, last.reverseEnd - (previous ? previous.reverseEnd : first.reverseStart) + (previous ? 0 : 1));
}
export function measureQuranFaces(start,end) {
  const first=byAyah.get(`${Number(start?.surah)}:${Number(start?.ayah)}`);
  const last=byAyah.get(`${Number(end?.surah)}:${Number(end?.ayah)}`);
  if (!first || !last) return 0;
  const reverse=first.surah>last.surah;
  const low=reverse ? first.reverseStart : Math.min(first.forwardStart,last.forwardStart);
  const high=reverse ? last.reverseEnd : Math.max(first.forwardEnd,last.forwardEnd);
  const raw=Math.max(0,high-low+1)/LINES_PER_FACE;
  return raw>0 ? Math.max(0.25,Math.round(raw*4)/4) : 0;
}

export function quranRangeFacesSql(alias='t',end='expected') {
  if (!/^[a-zA-Z_]\w*$/.test(alias) || !['actual','expected'].includes(end)) throw new Error('Invalid Quran range SQL selector');
  const endColumn=key => end==='actual' ? `COALESCE(${alias}.actual_to_${key},${alias}.to_${key})` : `${alias}.to_${key}`;
  return `COALESCE((SELECT GREATEST(0.25, ROUND(GREATEST(0, CASE
    WHEN first_pos.surah > last_pos.surah THEN last_pos.reverse_end - first_pos.reverse_start + 1
    ELSE GREATEST(last_pos.forward_end, first_pos.forward_end) - LEAST(first_pos.forward_start, last_pos.forward_start) + 1
    END) * 4 / 15) / 4)
    FROM quran_face_positions first_pos JOIN quran_face_positions last_pos
      ON last_pos.surah = ${endColumn('surah')} AND last_pos.ayah = ${endColumn('ayah')}
    WHERE first_pos.surah = ${alias}.from_surah AND first_pos.ayah = ${alias}.from_ayah), 0)`;
}

export function acceptedQuranExecutionSql(alias='t') {
  if (!/^[a-zA-Z_]\w*$/.test(alias)) throw new Error('Invalid Quran status SQL selector');
  return `(${alias}.teacher_completed = 1 OR (${alias}.teacher_completed IS NULL
    AND ${alias}.student_status = 'done' AND COALESCE(${alias}.execution_state, '') IN ('complete','partial','extra')))`;
}
