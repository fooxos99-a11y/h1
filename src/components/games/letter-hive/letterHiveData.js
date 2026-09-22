import questionData from './letterHiveQuestions.json' with { type: 'json' };

export const BOARD_LETTERS = [
  "د",
  "ت",
  "ل",
  "ش",
  "ف",
  "م",
  "ج",
  "س",
  "خ",
  "ي",
  "أ",
  "ع",
  "ك",
  "غ",
  "ح",
  "ب",
  "ن",
  "هـ",
  "و",
  "ر",
  "ز",
  "ط",
  "ض",
  "ق",
  "ص"
];

export const BASE_LETTERS = [
  "ا",
  "أ",
  "ب",
  "ت",
  "ث",
  "ج",
  "ح",
  "خ",
  "د",
  "ذ",
  "ر",
  "ز",
  "س",
  "ش",
  "ص",
  "ض",
  "ط",
  "ظ",
  "ع",
  "غ",
  "ف",
  "ق",
  "ك",
  "ل",
  "م",
  "ن",
  "هـ",
  "و",
  "ي"
];

export const SUBTLE_HEX_PATTERN = "url(\"data:image/svg+xml,%3Csvg width='180' height='156' viewBox='0 0 180 156' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M45 2L88 27V77L45 102L2 77V27L45 2Z' stroke='%23ffffff' stroke-opacity='0.20' stroke-width='3'/%3E%3Cpath d='M135 54L178 79V129L135 154L92 129V79L135 54Z' stroke='%23ffffff' stroke-opacity='0.16' stroke-width='3'/%3E%3C/svg%3E\")";

export const LETTER_HIVE_QUESTIONS = questionData;
