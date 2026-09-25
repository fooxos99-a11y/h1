import { settingsNavigationItems } from '@/lib/settingsNavigation';

const createSectionRoutes = (entries) => {
  const slugByKey = Object.freeze(Object.fromEntries(entries));
  const keyBySlug = Object.freeze(Object.fromEntries(entries.map(([key, slug]) => [slug, key])));

  return {
    getSlug: (key) => slugByKey[key] || '',
    getKey: (slug) => keyBySlug[slug] || '',
  };
};

export const dashboardSectionRoutes = createSectionRoutes([
  ['manualAttendance', 'attendance'],
  ['staffAttendance', 'staff-attendance'],
  ['mushaf', 'mushaf'],
  ['executionFollowup', 'execution-followup'],
  ['notifications', 'notifications'],
  ['reports', 'reports'],
  ['programs', 'programs'],
  ['users', 'users'],
  ['students', 'students'],
  ['studentPlans', 'student-plans'],
  ['studentExecutionCorrections', 'student-execution-corrections'],
  ['teacherPoints', 'points-adjustment'],
  ['families', 'families'],
  ['supervisors', 'supervisors'],
  ['reciters', 'reciters'],
  ['administrators', 'administrators'],
  ['quranTests', 'quran-tests'],
  ['narrationDay', 'narration-day'],
  ['calls', 'calls'],
  ['whatsappSend', 'whatsapp'],
  ['registrationRequests', 'registration-requests'],
  ['contactMessages', 'contact-messages'],
  ['settings', 'settings'],
  ['store', 'store'],
  ['settingsNews', 'news'],
  ['culturalCompetition', 'cultural-competitions'],
  ['quranEvaluation', 'recitation-sessions'],
  ['previousRecitationSessions', 'previous-recitation-sessions'],
  ...settingsNavigationItems.map(({ key, slug }) => [key, slug]),
]);

export const portalSectionRoutes = createSectionRoutes([
  ['quranExecution', 'quran-execution'],
  ['mushaf', 'mushaf'],
  ['quranSessions', 'my-plan'],
  ['quranSaved', 'quran-saved'],
  ['quranEvaluation', 'recitation-sessions'],
  ['previousRecitationSessions', 'previous-recitation-sessions'],
  ['studentPlans', 'student-plans'],
  ['teacherPoints', 'points-adjustment'],
  ['teacherReports', 'reports'],
  ['calls', 'calls'],
  ['store', 'store'],
  ['programs', 'programs'],
  ['dailyChallenge', 'daily-challenge'],
  ['summit', 'summit'],
  ['staffAttendance', 'staff-attendance'],
  ['culturalCompetition', 'cultural-competitions'],
]);
