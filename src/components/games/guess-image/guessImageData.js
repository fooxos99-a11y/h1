const stageNames = [
  'المرحلة الأولى',
  'المرحلة الثانية',
  'المرحلة الثالثة',
];

const imageBank = [
  { number: 1, answer: 'بطريق' },
  { number: 2, answer: 'ثعلب' },
  { number: 3, answer: 'إبليس' },
  { number: 4, answer: 'سماء' },
  { number: 5, answer: 'نهر' },
  { number: 6, answer: 'قبرص' },
  { number: 7, answer: 'وحيد القرن' },
  { number: 8, answer: 'صومال' },
  { number: 9, answer: 'بيروت' },
  { number: 10, answer: 'بريدة' },
  { number: 11, answer: 'سلمى' },
  { number: 12, answer: 'سرير' },
  { number: 13, answer: 'شجرة' },
  { number: 14, answer: 'عجوز' },
  { number: 15, answer: 'منار' },
  { number: 16, answer: 'نجيب' },
  { number: 17, answer: 'عصام' },
  { number: 18, answer: 'رأس الخيمة' },
  { number: 19, answer: 'المدينة المنورة' },
  { number: 20, answer: 'جبل طارق' },
  { number: 21, answer: 'أم القرى' },
  { number: 22, answer: 'بطل' },
  { number: 23, answer: 'دولاب' },
  { number: 24, answer: 'كلبشات' },
  { number: 25, answer: 'زرقاء اليمامة' },
  { number: 26, answer: 'ابن بطوطة' },
  { number: 27, answer: 'قرنفل' },
  { number: 28, answer: 'انتحار' },
  { number: 29, answer: 'الحجر الأسود' },
  { number: 30, answer: 'ليلة القدر' },
];

const stageAssignments = [
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
  [21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
];

export const GUESS_IMAGE_STAGES = stageNames.map((name, index) => ({
  id: String(index + 1),
  name,
}));

export const GUESS_IMAGE_QUESTIONS = stageAssignments.flatMap((numbers, stageIndex) => {
  const stage = GUESS_IMAGE_STAGES[stageIndex];
  return numbers.map((number, questionIndex) => {
    const source = imageBank[number - 1];
    return {
      id: `guess-stage-${stage.id}-question-${questionIndex + 1}`,
      image: `/guess-images/rebus/${String(source.number).padStart(2, '0')}.png`,
      hint: 'متوسط',
      answer: source.answer,
      stageId: stage.id,
      stageName: stage.name,
    };
  });
});
