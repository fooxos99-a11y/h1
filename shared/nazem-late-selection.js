const sameTrack = (a, b) => Number(a.studentId) === Number(b.studentId)
  && Number(a.planId) === Number(b.planId) && a.taskType === b.taskType
  && (a.track || 'memorization') === (b.track || 'memorization');

export const sortNazemLateTasks = tasks => [...tasks].sort((a, b) =>
  String(a.taskDate).localeCompare(String(b.taskDate)) || Number(a.id) - Number(b.id));

// A selection is a prefix of whole, adjacent remote days, never an arbitrary verse range.
export function nazemLateOptions(first, queue, chapters = []) {
  if (!Number(first?.nazemLate) || first.taskType !== 'memorization') return [];
  const candidates = sortNazemLateTasks(queue.filter(task => sameTrack(first, task)
    && Number(task.nazemLate) && !task.locallySaved && !task.nazemSubmissionLocked));
  if (Number(candidates[0]?.id) !== Number(first.id)) return [];
  const options = [];
  for (const task of candidates) {
    const previous = options.at(-1)?.task;
    if (previous) {
      const count = Number(previous.toSurahAyahCount)
        || Number(chapters.find(chapter => Number(chapter.number) === Number(previous.toSurah))?.ayahCount);
      const adjacent = Number(task.fromSurah) === Number(previous.toSurah)
        ? Number(task.fromAyah) === Number(previous.toAyah) + 1
        : Number(task.fromSurah) === Number(previous.toSurah) + 1
          && Number(task.fromAyah) === 1 && count > 0 && Number(previous.toAyah) === count;
      if (!adjacent || task.taskDate === previous.taskDate) break;
    }
    options.push({ task, page: Number(task.toPage), surah: Number(task.toSurah),
      ayah: Number(task.toAyah), surahName: task.toSurahName });
  }
  return options;
}

export function selectNazemLatePrefix(options, end) {
  const index = options.findIndex(option => Number(option.surah) === Number(end?.surah)
    && Number(option.ayah) === Number(end?.ayah));
  return options.slice(0, index < 0 ? 1 : index + 1).map(option => option.task);
}
