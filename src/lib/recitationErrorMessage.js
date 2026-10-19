export function recitationErrorMessage(error, fallback = 'تعذرت العملية. أعد المحاولة.') {
  const message = String(error?.message || '');
  if (/CreateConnection|SQLite|SQLCipher|Connection .+ already exists|connection .+ not available/i.test(message)) {
    return 'تعذر الوصول إلى بيانات التسميع على الجهاز. أعد المحاولة.';
  }
  return /FetchEvent|Load failed|Failed to fetch|NetworkError|network request failed/i.test(message)
    ? 'تعذر الاتصال بالخادم. التقييم المحفوظ على الجهاز سيُرسل تلقائيًا عند عودة الاتصال.'
    : message || fallback;
}
