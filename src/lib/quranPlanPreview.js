export const countExpectedMemorizationDays = ({ pages, dailyPages }) => {
  const totalPages = Math.max(0, Number(pages || 0));
  const pagesPerDay = Math.max(0.25, Number(dailyPages || 1));
  return Math.ceil(totalPages / pagesPerDay);
};
