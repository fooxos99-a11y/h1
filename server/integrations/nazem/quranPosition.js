const ARABIC_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;

const normalizeDigits = (value) => String(value ?? '')
  .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
  .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));

export const normalizeQuranSurahName = (value) => String(value ?? '')
  .normalize('NFKC')
  .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
  .replace(ARABIC_DIACRITICS, '')
  .replace(/ـ/g, '')
  .replace(/^\s*سورة\s*/u, '')
  .replace(/[أإآٱ]/g, 'ا')
  .replace(/ؤ/g, 'و')
  .replace(/ئ/g, 'ي')
  .replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه')
  .replace(/ء/g, '')
  .replace(/[^\p{Script=Arabic}\p{Number}]/gu, '');

const SURAH_ALIASES = new Map([
  ['براءة', 'التوبة'],
  ['بني إسرائيل', 'الإسراء'],
  ['حم السجدة', 'فصلت'],
  ['الدهر', 'الإنسان'],
  ['هل أتى', 'الإنسان'],
  ['ألم نشرح', 'الشرح'],
  ['تبت', 'المسد'],
].map(([alias, canonical]) => [
  normalizeQuranSurahName(alias),
  normalizeQuranSurahName(canonical),
]));

const surahNumberCache = new WeakMap();

async function loadSurahNumbers(connection) {
  if (!surahNumberCache.has(connection)) {
    surahNumberCache.set(connection, connection.query(
      'SELECT surah_number AS surah, name_arabic AS name FROM quran_surahs',
    ).then(([rows]) => new Map(rows.map((row) => [
      normalizeQuranSurahName(row.name),
      Number(row.surah),
    ]))));
  }
  return surahNumberCache.get(connection);
}

export async function getNazemQuranPosition(connection, surahName, ayah) {
  const ayahNumber = Number(normalizeDigits(ayah));
  if (!Number.isInteger(ayahNumber) || ayahNumber < 1) return null;

  const rawSurah = normalizeDigits(surahName).trim();
  const numericSurah = Number(rawSurah);
  let surahNumber = Number.isInteger(numericSurah) && numericSurah >= 1 && numericSurah <= 114
    ? numericSurah
    : null;

  if (!surahNumber) {
    const normalizedName = normalizeQuranSurahName(rawSurah);
    if (!normalizedName) return null;
    const canonicalName = SURAH_ALIASES.get(normalizedName) || normalizedName;
    const surahNumbers = await loadSurahNumbers(connection);
    surahNumber = surahNumbers.get(canonicalName) || null;
  }
  if (!surahNumber) return null;

  const [[position]] = await connection.query(
    `SELECT page_number AS page, surah_number AS surah, ayah_number AS ayah
     FROM quran_ayah_pages WHERE surah_number = ? AND ayah_number = ? LIMIT 1`,
    [surahNumber, ayahNumber],
  );
  return position || null;
}
