import { studentsApi } from '@/services/studentsApi';
import { loadOfflineSnapshot } from '@/services/offlineOperationsService';
import { getDailyChallengeCached, getSummitJourneyCached, loadPublicSettingsCached } from '@/services/publicSettingsCache';

export async function loadStudentHomeExtras({ showPath, showDailyChallenge, onUpdate, refresh = false }) {
  const keys = ['settings', 'journey', 'challenge'];
  const entries = await Promise.allSettled([
    loadPublicSettingsCached({ refresh }),
    showPath ? getSummitJourneyCached({ refresh }) : null,
    showDailyChallenge ? getDailyChallengeCached({ refresh }) : null,
  ].map((request, index) => Promise.resolve(request).then((value) => {
    onUpdate?.({ [keys[index]]: value, [`${keys[index]}Error`]: false });
    return value;
  }, (error) => { onUpdate?.({ [`${keys[index]}Error`]: true }); throw error; })));
  const value = (index) => entries[index].status === 'fulfilled' ? entries[index].value : null;
  return { settings: value(0), journey: value(1), challenge: value(2),
    settingsError: entries[0].status === 'rejected', journeyError: entries[1].status === 'rejected', challengeError: entries[2].status === 'rejected' };
}

export const loadStudentMemorized = (studentId) => loadOfflineSnapshot(studentId, 'student:memorized-ranges-v1', () => studentsApi.getStudentQuranSaved(studentId), { actorRole: 'student' });

export async function loadStudentHomeRankings() {
  const settings = await loadPublicSettingsCached();
  const [students, families] = await Promise.allSettled([
    settings.studentRankingsVisible === false ? [] : studentsApi.getStudentRankings({ committeeId: 'all' }),
    settings.familyRankingsVisible === false ? [] : studentsApi.getFamilyRankings(),
  ]);
  const rows = (result) => result.status === 'fulfilled' && Array.isArray(result.value) ? result.value.filter((row) => row?.name).map((row, index) => ({ ...row, rank: Number(row.rank || index + 1) })) : [];
  return { settings, students: rows(students), families: rows(families), studentError: students.status === 'rejected', familyError: families.status === 'rejected' };
}
