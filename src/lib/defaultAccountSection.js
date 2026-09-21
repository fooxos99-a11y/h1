export const defaultAccountSection = (role, sections = []) => (
  ['supervisor', 'reciter'].includes(role) && sections.some((section) => section.key === 'quranEvaluation')
    ? 'quranEvaluation'
    : sections[0]?.key || ''
);
