export function groupProgramSections(programs) {
  return programs.filter(program => !program.parentPathId).map(program => {
    const sections = programs.filter(section => Number(section.parentPathId) === program.id);
    if (!sections.length && !program.sectionsEnabled) return { ...program, sections: [], sectionsEnabled: false };
    return { ...program, sections, sectionsEnabled: true,
      pointsReward: sections.reduce((sum, section) => sum + section.pointsReward, 0),
      earnedPoints: sections.reduce((sum, section) => sum + section.earnedPoints, 0),
      completedAt: sections.length > 0 && sections.every(section => section.completedAt) ? sections.map(section => section.completedAt).sort().at(-1) : null };
  });
}
