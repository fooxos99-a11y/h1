const position = (surah, ayah) => Number(surah) * 1000 + Number(ayah);

// Keep an evaluated prefix out of a later remainder on the same original day.
export function tasksMatchingNazemRange(tasks, day) {
  if (!day?.surah_from || !day?.verse_from || !day?.surah_to || !day?.verse_to) return tasks;
  const start = position(day.surah_from, day.verse_from);
  const end = position(day.surah_to, day.verse_to);
  const direction = start > end ? -1 : 1;
  const exact = tasks.filter(task => position(task.fromSurah, task.fromAyah) === start
    && position(task.toSurah, task.toAyah) === end);
  if (exact.length) return exact.length === 1 ? exact : [];
  const rows = tasks.filter(task => {
    const from = position(task.fromSurah, task.fromAyah);
    const to = position(task.toSurah, task.toAyah);
    return direction * (from - start) >= 0 && direction * (end - to) >= 0
      && direction * (to - from) >= 0;
  }).sort((a, b) => direction * (position(a.fromSurah, a.fromAyah) - position(b.fromSurah, b.fromAyah)));
  if (!rows.length || position(rows[0].fromSurah, rows[0].fromAyah) !== start
    || position(rows.at(-1).toSurah, rows.at(-1).toAyah) !== end
    || rows.some((row, index) => index && direction * (position(row.fromSurah, row.fromAyah)
      - position(rows[index - 1].toSurah, rows[index - 1].toAyah)) <= 0)) return [];
  return rows;
}

export function nazemTaskRangeSql(task = 't', day = 'lateDay') {
  if (![task, day].every(alias => /^[a-zA-Z]\w*$/.test(alias))) throw new Error('Invalid task range alias');
  const point = (surah, ayah) => `(CAST(JSON_UNQUOTE(JSON_EXTRACT(${day}.remote_snapshot, '$.${surah}')) AS UNSIGNED) * 1000
    + CAST(JSON_UNQUOTE(JSON_EXTRACT(${day}.remote_snapshot, '$.${ayah}')) AS UNSIGNED))`;
  const from = point('surah_from', 'verse_from'), to = point('surah_to', 'verse_to');
  return `(${task}.task_type = 'link' OR (
    (${task}.from_surah * 1000 + ${task}.from_ayah) BETWEEN LEAST(${from}, ${to}) AND GREATEST(${from}, ${to})
    AND (${task}.to_surah * 1000 + ${task}.to_ayah) BETWEEN LEAST(${from}, ${to}) AND GREATEST(${from}, ${to})
  ))`;
}
