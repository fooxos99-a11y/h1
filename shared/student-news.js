export const emptyStudentNews = () => ({ title: 'الأخبار والتكريم', images: [], studentIds: [], expiresOn: '', enabled: true, revision: 0 });
export function visibleStudentNews(config, studentId, today) {
  if (!config.enabled || !config.images?.length || (config.expiresOn && config.expiresOn < today)) return null;
  if (config.studentIds?.length && !config.studentIds.includes(Number(studentId))) return null;
  return { title: config.title, images: config.images, expiresOn: config.expiresOn };
}
