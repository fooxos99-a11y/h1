// Both local and Nazem plans expose these normalized, completed quantities.
export function studentPlanLevel(plan) {
  if (!plan) return 0;
  for (const [totalKey, completedKey] of [['totalAyahs', 'completedAyahs'], ['totalPages', 'completedPages']]) {
    const total = Number(plan[totalKey]);
    const completed = Number(plan[completedKey]);
    if (total > 0 && Number.isFinite(total) && plan[completedKey] != null && Number.isFinite(completed)) {
      return Math.max(0, Math.min(100, Math.floor(completed / total * 100)));
    }
  }
  // Older offline snapshots contain only a rounded percentage: they cannot prove completion.
  const percent = Number(plan.progressPercent ?? plan.progress?.progressPercent ?? 0);
  return Number.isFinite(percent) ? Math.max(0, Math.min(plan.status === 'completed' ? 100 : 99, Math.floor(percent))) : 0;
}


// A shorter milestone gives visible movement without changing earned plan levels.
export function studentLevelStage(plan) {
  const level = studentPlanLevel(plan);
  const target = Math.min(100, (Math.floor(level / 10) + 1) * 10);
  return { target, progress: level === 100 ? 100 : (level % 10) * 10 };
}
