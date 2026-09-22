// Advance past each closing bracket once; unmatched opening brackets remain text.
function stripMarkup(value) {
  const parts = [];
  let cursor = 0;
  while (cursor < value.length) {
    const start = value.indexOf('<', cursor);
    if (start === -1) break;
    const end = value.indexOf('>', start + 1);
    if (end === -1) break;
    parts.push(value.slice(cursor, start));
    cursor = end + 1;
  }
  parts.push(value.slice(cursor));
  return parts.join('');
}

export const hasProgramActivity = (program) => Boolean(
  program?.questions?.length || program?.contents?.some(item =>
    stripMarkup(String(item.value || '')).replace(/&nbsp;/gi, ' ').trim()),
);

export const canOpenProgram = (program) => Boolean(
  (program?.sectionsEnabled && program?.sections?.length) || hasProgramActivity(program),
);
