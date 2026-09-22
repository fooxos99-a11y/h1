export const hasProgramActivity = (program) => Boolean(
  program?.questions?.length || program?.contents?.some(item =>
    String(item.value || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim()),
);

export const canOpenProgram = (program) => Boolean(
  (program?.sectionsEnabled && program?.sections?.length) || hasProgramActivity(program),
);
