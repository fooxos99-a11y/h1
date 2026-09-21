import { LETTER_HIVE_QUESTIONS } from './letterHiveData';

const LETTER_HIVE_STORAGE_KEY = 'road-letter-hive-question-bank-v5';

const normalizeQuestionBank = (bank) => Object.entries(bank).reduce((acc, [letter, items]) => {
  acc[letter] = items.map((item, index) => ({
    id: item.id || `${letter}-${index}-${Date.now()}`,
    letter,
    question: item.question,
    answer: item.answer,
  }));
  return acc;
}, {});

export const loadQuestionBank = () => {
  const fallback = normalizeQuestionBank(LETTER_HIVE_QUESTIONS);
  try {
    const saved = localStorage.getItem(LETTER_HIVE_STORAGE_KEY);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
};

const saveQuestionBank = (nextBank) => {
  localStorage.setItem(LETTER_HIVE_STORAGE_KEY, JSON.stringify(nextBank));
};

const readResponse = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'تعذر تحديث بنك الأسئلة.');
  return data;
};

export const loadSharedQuestionBank = async () => {
  const data = await fetch('/api/cultural-games/question-bank/letter-hive', { cache: 'no-store' }).then(readResponse);
  const bank = data.bank ? normalizeQuestionBank(data.bank) : loadQuestionBank();
  saveQuestionBank(bank);
  return bank;
};

export const saveSharedQuestionBank = async (nextBank) => {
  const bank = normalizeQuestionBank(nextBank);
  const data = await fetch('/api/cultural-games/question-bank/letter-hive', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bank }),
  }).then(readResponse);
  saveQuestionBank(data.bank);
  return data.bank;
};

export const addQuestionToBank = (bank, { letter, question, answer }) => ({
  ...bank,
  [letter]: [...(bank[letter] || []), { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, letter, question, answer }],
});

export const updateQuestionInBank = (bank, id, payload) => {
  const next = Object.fromEntries(Object.entries(bank).map(([letter, list]) => [letter, list.filter((item) => item.id !== id)]));
  next[payload.letter] = [...(next[payload.letter] || []), { id, ...payload }];
  return next;
};

export const deleteQuestionFromBank = (bank, id) => (
  Object.fromEntries(Object.entries(bank).map(([letter, list]) => [letter, list.filter((item) => item.id !== id)]))
);
