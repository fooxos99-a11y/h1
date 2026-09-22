import { secureShuffle } from '../../shared/secure-random.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const requestJson = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers) },
    ...options,
  });

  if (!response.ok) {
    throw new Error('تعذر تحديث حالة الأسئلة.');
  }

  return response.json();
};

export const allocateQuestionGroups = async (gameType, groups, maxPerGroup = 1) => {
  const data = await requestJson(`/api/cultural-games/used-questions/${gameType}/allocate`, {
    method: 'POST',
    body: JSON.stringify({ groups, maxPerGroup }),
  });
  return data.allocated || {};
};

export const pickUnusedQuestion = async (gameType, questions) => {
  if (!questions.length) return null;

  const shuffled = secureShuffle(questions);
  const allocated = await allocateQuestionGroups(gameType, [{
    id: 'draw',
    questionIds: shuffled.map((question) => question.id),
  }]);
  const questionId = allocated.draw?.[0];
  return questions.find((question) => question.id === questionId) || null;
};
