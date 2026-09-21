import { studentsApi } from '@/services/studentsApi';
import { getTenantRegistrationNumber } from '@/services/apiBase';
import { getSaudiDate } from '@/lib/dailyChallengeAvailability';

const CACHE_VERSION = 1;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
let activeRequest = null;
const experienceCache = {
  summit: { identity: '', value: null, request: null },
  dailyChallenge: { identity: '', value: null, request: null },
};
let dailyChallengeCacheDate = getSaudiDate();

const cacheKey = () => `rawasi_public_settings_v${CACHE_VERSION}_${getTenantRegistrationNumber() || 'default'}`;

export const readPublicSettingsCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey()) || 'null');
    if (!cached?.value || Date.now() - Number(cached.savedAt || 0) > MAX_AGE_MS) return null;
    return cached.value;
  } catch {
    return null;
  }
};

export const writePublicSettingsCache = (value) => {
  if (!value || typeof value !== 'object') return;
  localStorage.setItem(cacheKey(), JSON.stringify({ savedAt: Date.now(), value }));
};

export const loadPublicSettingsCached = async ({ refresh = false } = {}) => {
  const cached = readPublicSettingsCache();
  if (cached && !refresh) return cached;
  if (activeRequest) return activeRequest;
  activeRequest = studentsApi.getPublicSettings()
    .then((settings) => {
      writePublicSettingsCache(settings);
      return settings;
    })
    .finally(() => { activeRequest = null; });
  return activeRequest;
};

const getStudentExperienceIdentity = () => [
  getTenantRegistrationNumber() || 'default',
  localStorage.getItem('wajeh_role') || 'guest',
  localStorage.getItem('wajeh_student_id') || 'none',
].join(':');

const loadExperience = (key, loader, { refresh = false } = {}) => {
  const entry = experienceCache[key];
  const identity = getStudentExperienceIdentity();
  if (entry.identity !== identity) {
    entry.identity = identity;
    entry.value = null;
    entry.request = null;
  }
  if (entry.value && !refresh) return Promise.resolve(entry.value);
  if (entry.request && !refresh) return entry.request;
  const request = loader()
    .then((value) => {
      if (entry.request === request && entry.identity === identity) entry.value = value;
      return value;
    })
    .finally(() => {
      if (entry.request === request) entry.request = null;
    });
  entry.request = request;
  return request;
};

export const getSummitJourneyCached = (options) => loadExperience('summit', studentsApi.getSummitJourney, options);
export const getDailyChallengeCached = (options) => {
  const date = getSaudiDate();
  if (date !== dailyChallengeCacheDate) {
    dailyChallengeCacheDate = date;
    experienceCache.dailyChallenge.value = null;
    experienceCache.dailyChallenge.request = null;
  }
  return loadExperience('dailyChallenge', studentsApi.getDailyChallenge, options);
};
export const invalidateSummitJourneyCache = () => { experienceCache.summit.value = null; };
export const invalidateDailyChallengeCache = () => { experienceCache.dailyChallenge.value = null; };
export const clearStudentExperienceCaches = () => {
  Object.values(experienceCache).forEach((entry) => {
    entry.identity = '';
    entry.value = null;
    entry.request = null;
  });
};

export const preloadStudentExperiences = (features = {}) => {
  void import('@/components/portal/StudentDailyChallengeSection');
  void import('@/components/portal/SummitJourneySection');
  [
    '/summit/qassim-road-city-departure.webp',
    '/summit/qassim-road-desert.webp',
    '/summit/qassim-road-city-approach.webp',
    '/summit/qassim-road-city-entrance.webp',
    '/summit/qassim-road-city-interior.webp',
    '/summit/qassim-road-station.webp',
  ].forEach((source) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = source;
  });
  if (localStorage.getItem('wajeh_role') !== 'student') return;
  if (features.summitEnabled) void getSummitJourneyCached().catch(() => {});
  if (features.dailyChallengeAvailable) void getDailyChallengeCached().catch(() => {});
};
