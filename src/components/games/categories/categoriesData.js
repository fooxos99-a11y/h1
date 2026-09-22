import questionData from './categoriesQuestions.json' with { type: 'json' };

export const DEFAULT_CATEGORIES = questionData;
const CATEGORIES_STORAGE_KEY = 'road-categories-game-bank-v5';

export const loadCategoriesBank = () => {
  if (typeof window === 'undefined') return DEFAULT_CATEGORIES;
  try {
    const saved = window.localStorage.getItem(CATEGORIES_STORAGE_KEY);
    if (!saved) return DEFAULT_CATEGORIES;
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_CATEGORIES;
  } catch {
    return DEFAULT_CATEGORIES;
  }
};
