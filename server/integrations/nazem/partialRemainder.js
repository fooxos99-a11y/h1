const parse = value => typeof value === 'string' ? JSON.parse(value) : value;

// A changed range alone is not proof. Require the latest official attempt's
// confirmed partial receipt, the same source day, and exactly the next ayah.
export async function isConfirmedNazemRemainder(connection, tasks, day) {
  if (!day?.nazemLate || !/^[1-9]\d{0,19}$/.test(String(day.source_day_id || '')) || day.status !== 'pending') return false;
  const matches = tasks.filter(task => {
    const remote = parse(task.deliverySnapshot);
    const local = parse(task.deliveryLocal);
    return task.deliveryStatus === 'synced' && remote?.status === 'partial'
      && String(remote.externalId || remote.id) === String(day.source_day_id)
      && Number(task.toSurah) === Number(day.surah_to) && Number(task.toAyah) === Number(day.verse_to)
      && Number(local?.fromSurahId) === Number(task.fromSurah)
      && Number(local?.fromAyah) === Number(task.fromAyah)
      && Number(remote.actual_surah_to) === Number(local?.toSurahId)
      && Number(remote.actual_verse_to) === Number(local?.toAyah);
  });
  if (matches.length !== 1) return false;
  const remote = parse(matches[0].deliverySnapshot);
  const [[next]] = await connection.query(`SELECT surah_number AS surah, ayah_number AS ayah
    FROM quran_ayah_pages WHERE surah_number > ? OR (surah_number = ? AND ayah_number > ?)
    ORDER BY surah_number, ayah_number LIMIT 1`,
  [remote.actual_surah_to, remote.actual_surah_to, remote.actual_verse_to]);
  return Number(next?.surah) === Number(day.surah_from) && Number(next?.ayah) === Number(day.verse_from);
}
