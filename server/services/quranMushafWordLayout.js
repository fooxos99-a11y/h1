export const getQcfSourcePages = (pageNumber) => {
  const page = Number(pageNumber || 0);
  if (page <= 1) return page === 1 ? [1] : [];
  return [page - 1, page];
};

export const getInclusiveQcfPages = (fromPage, toPage) => {
  const from = Number(fromPage || 0);
  const to = Number(toPage || 0);
  if (from <= 0 || to <= 0) return [];
  const direction = from <= to ? 1 : -1;
  return Array.from(
    { length: Math.abs(to - from) + 1 },
    (_, index) => from + (index * direction)
  );
};

export const collectQcfPageWords = (payloads, pageNumber) => {
  const page = Number(pageNumber || 0);
  const wordsByLocation = new Map();
  for (const payload of payloads || []) {
    for (const verse of payload?.verses || []) {
      for (const word of verse.words || []) {
        const normalizedWord = {
          id: Number(word.id || 0),
          page: Number(word.page_number || 0),
          line: Number(word.line_number || 0),
          position: Number(word.position || 0),
          location: String(word.location || ''),
          verseKey: String(word.verse_key || verse.verse_key || ''),
          charType: String(word.char_type_name || 'word'),
          codeV2: String(word.code_v2 || word.text || ''),
          textQpcHafs: String(word.text_qpc_hafs || ''),
        };
        if (normalizedWord.page === page && normalizedWord.line > 0 && normalizedWord.location) {
          wordsByLocation.set(normalizedWord.location, normalizedWord);
        }
      }
    }
  }
  return [...wordsByLocation.values()].sort((first, second) => (
    first.line - second.line || first.id - second.id || first.position - second.position
  ));
};
