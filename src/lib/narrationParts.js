export function groupNarrationParts(parts = []) {
  const groups = new Map();
  for (const part of parts) {
    const juzNumber = Number(part.juzNumber);
    if (!groups.has(juzNumber)) groups.set(juzNumber, { juzNumber, parts: [] });
    groups.get(juzNumber).parts.push(part);
  }
  return [...groups.values()].sort((a, b) => a.juzNumber - b.juzNumber).map(group => ({
    ...group,
    parts: [...group.parts].sort((a, b) => Number(a.startSurah) - Number(b.startSurah)
      || Number(a.startAyah) - Number(b.startAyah)),
  }));
}

export function narrationRangeLabel(part) {
  if (part.startSurahName && part.endSurahName) {
    return `من ${part.startSurahName} ${part.startAyah} إلى ${part.endSurahName} ${part.endAyah}`;
  }
  return part.rangeLabel || `الجزء ${part.juzNumber}`;
}
