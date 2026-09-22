import { SUMMIT_MAP_CHALLENGES, normalizeSummitChallengeType } from './summit.js';
import { normalizeSummitCityScenes, normalizeSummitImageId } from './summit-scenes.js';

export const SUMMIT_TOTAL_KILOMETERS = 8000;
export const SUMMIT_MAX_CONFIGURABLE_KILOMETERS = 100000;
export const SUMMIT_CITY_SCENE_LENGTH_KILOMETERS = 500;

export const SUMMIT_DEFAULT_CITIES = Object.freeze([
  { key: 'buraidah', name: 'بريدة', kilometer: 0 },
  { key: 'unaizah', name: 'عنيزة', kilometer: 1000 },
  { key: 'mithnab', name: 'المذنب', kilometer: 2000 },
  { key: 'rass', name: 'الرس', kilometer: 3000 },
  { key: 'badai', name: 'البدائع', kilometer: 4000 },
  { key: 'bukayriyah', name: 'البكيرية', kilometer: 5000 },
  { key: 'uyun-al-jiwa', name: 'عيون الجواء', kilometer: 6000 },
  { key: 'asyah', name: 'الأسياح', kilometer: 7000 },
]);

const DEFAULT_CHALLENGES = ['summit_forest', 'summit_cave'];
const LEGACY_DEFAULT_STATIONS = SUMMIT_DEFAULT_CITIES.slice(1).map((city, index) => ({
  id: `station-${city.key}`,
  name: city.name,
  kilometer: city.kilometer,
  visibleFromKilometer: Math.max(0, city.kilometer - 1000),
  visibleUntilKilometer: city.kilometer,
  notificationEnabled: true,
  notificationText: `وصلت إلى ${city.name}`,
  challengeEnabled: true,
  challengeType: DEFAULT_CHALLENGES[index % DEFAULT_CHALLENGES.length],
  rewardPoints: 50,
}));

export const SUMMIT_DEFAULT_MAP_CONFIG = Object.freeze({
  version: 1,
  goal: {
    enabled: true,
    name: 'الوجهة النهائية',
    kilometer: SUMMIT_TOTAL_KILOMETERS,
    revealDistance: 1000,
  },
  cities: SUMMIT_DEFAULT_CITIES.map((city) => ({
    ...city,
    notificationEnabled: false,
    notificationText: `وصلت إلى ${city.name}`,
    challengeEnabled: false,
    challengeType: 'summit_forest',
    rewardPoints: 50,
  })),
  stations: [],
  signs: [],
});

const challengeTypes = new Set(SUMMIT_MAP_CHALLENGES.map(({ type }) => type));
const cleanText = (value, fallback = '', maxLength = 120) => String(value ?? fallback).trim().slice(0, maxLength);
const clampKilometer = (value, { allowStart = false, maximum = SUMMIT_MAX_CONFIGURABLE_KILOMETERS } = {}) => Math.min(
  maximum,
  Math.max(allowStart ? 0 : 1, Math.trunc(Number(value) || 0)),
);
const safeId = (value, fallback) => cleanText(value, fallback, 80).replace(/[^a-zA-Z0-9_-]/g, '-') || fallback;
const clampRewardPoints = (value) => Math.min(10000, Math.max(0, Math.trunc(Number(value) || 0)));
const isUntouchedLegacyDefaultStation = (station) => {
  const legacy = LEGACY_DEFAULT_STATIONS.find(({ id }) => id === String(station?.id || ''));
  if (!legacy) return false;
  return String(station?.name || '') === legacy.name
    && Number(station?.kilometer) === legacy.kilometer
    && Number(station?.visibleFromKilometer ?? legacy.visibleFromKilometer) === legacy.visibleFromKilometer
    && Number(station?.visibleUntilKilometer ?? legacy.visibleUntilKilometer) === legacy.visibleUntilKilometer
    && station?.notificationEnabled === true
    && String(station?.notificationText || '') === legacy.notificationText
    && station?.challengeEnabled === true
    && normalizeSummitChallengeType(station?.challengeType) === legacy.challengeType
    && Number(station?.rewardPoints ?? 50) === legacy.rewardPoints;
};

const normalizeMapLocation = (location, index, kind, fallback = {}, maximum = SUMMIT_MAX_CONFIGURABLE_KILOMETERS) => {
  const kilometer = clampKilometer(location?.kilometer ?? fallback.kilometer, { allowStart: true, maximum });
  const id = safeId(location?.id || location?.key, `${kind}-${kilometer}-${index + 1}`);
  const name = cleanText(location?.name, fallback.name || `${kind === 'city' ? 'مدينة' : 'محطة'} ${index + 1}`, 60)
    || `${kind === 'city' ? 'مدينة' : 'محطة'} ${index + 1}`;
  const selectedChallengeType = normalizeSummitChallengeType(location?.challengeType);
  const challengeType = challengeTypes.has(selectedChallengeType)
    ? selectedChallengeType
    : DEFAULT_CHALLENGES[index % DEFAULT_CHALLENGES.length];
  return {
    id,
    ...(kind === 'city' ? { key: id } : {}),
    locationType: kind,
    name,
    kilometer,
    notificationEnabled: kind !== 'station' && Boolean(location?.notificationEnabled),
    notificationText: cleanText(location?.notificationText, `وصلت إلى ${name}`, 180) || `وصلت إلى ${name}`,
    challengeEnabled: kind !== 'station' && Boolean(location?.challengeEnabled),
    challengeType,
    rewardPoints: clampRewardPoints(location?.rewardPoints ?? 50),
  };
};

export function normalizeSummitMapConfig(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const goalKilometer = Math.max(1, clampKilometer(
    source.goal?.kilometer ?? SUMMIT_DEFAULT_MAP_CONFIG.goal.kilometer,
    { allowStart: false },
  ));
  const goal = {
    enabled: source.goal?.enabled !== false,
    name: cleanText(source.goal?.name, SUMMIT_DEFAULT_MAP_CONFIG.goal.name, 60)
      || SUMMIT_DEFAULT_MAP_CONFIG.goal.name,
    kilometer: goalKilometer,
    revealDistance: Math.min(
      goalKilometer,
      Math.max(0, Math.trunc(Number(source.goal?.revealDistance ?? 1000) || 0)),
    ),
  };
  const locationMaximum = goal.enabled ? Math.max(0, goal.kilometer - 1) : SUMMIT_MAX_CONFIGURABLE_KILOMETERS;
  const rawCities = Array.isArray(source.cities) ? source.cities : SUMMIT_DEFAULT_MAP_CONFIG.cities;
  const usedCityIds = new Set();
  const cities = rawCities.slice(0, 24).map((city, index) => {
    const fallback = SUMMIT_DEFAULT_CITIES.find((item) => item.key === city?.key)
      || SUMMIT_DEFAULT_CITIES[index]
      || {};
    const normalized = normalizeMapLocation(city, index, 'city', fallback, locationMaximum);
    let id = normalized.id;
    while (usedCityIds.has(id)) id = `${id}-${index + 1}`;
    usedCityIds.add(id);
    return { ...normalized, id, key: id, cityEndKilometer: city?.cityEndKilometer, imageId: city?.imageId, roads: city?.roads };
  }).sort((first, second) => first.kilometer - second.kilometer).map((city, index, items) => ({
    ...city,
    ...normalizeSummitCityScenes(city, (items[index + 1]?.kilometer ?? (goal.enabled ? goal.kilometer : SUMMIT_MAX_CONFIGURABLE_KILOMETERS + 1)) - 1),
  }));

  const rawStations = Array.isArray(source.stations)
    ? source.stations.filter((station) => !isUntouchedLegacyDefaultStation(station))
    : SUMMIT_DEFAULT_MAP_CONFIG.stations;
  const usedStationIds = new Set();
  const usedKilometers = new Set();
  const stations = rawStations.slice(0, 24).map((station, index) => {
    const normalized = normalizeMapLocation(station, index, 'station', {}, locationMaximum);
    const { kilometer } = normalized;
    let { id } = normalized;
    while (usedStationIds.has(id)) id = `${id}-${index + 1}`;
    usedStationIds.add(id);
    if (usedKilometers.has(kilometer)) return null;
    usedKilometers.add(kilometer);
    return { ...normalized, id, imageId: normalizeSummitImageId(station.imageId) };
  }).filter(Boolean).sort((a, b) => a.kilometer - b.kilometer);

  const requestedActiveStationId = cleanText(source.activeStationId, '', 80);
  const activeStationId = stations.some(({ id }) => id === requestedActiveStationId)
    ? requestedActiveStationId
    : null;

  return {
    version: Math.max(1, Math.trunc(Number(source.version) || 1)),
    goal,
    cities,
    stations,
    signs: [],
    activeStationId,
  };
}

export const getSummitMapTotalKilometers = (config) => {
  const normalized = normalizeSummitMapConfig(config);
  if (normalized.goal.enabled) return normalized.goal.kilometer;
  const lastConfiguredKilometer = [...normalized.cities, ...normalized.stations]
    .reduce((maximum, item) => Math.max(maximum, Number(item.kilometer) || 0), 0);
  return Math.max(1, lastConfiguredKilometer || SUMMIT_TOTAL_KILOMETERS);
};

export const getSummitMapStation = (config, kilometer) => normalizeSummitMapConfig(config).stations
  .find((station) => station.kilometer === Number(kilometer)) || null;

export const getSummitActiveStation = (config) => {
  const normalized = normalizeSummitMapConfig(config);
  return normalized.stations.find(({ id }) => id === normalized.activeStationId) || null;
};

export const getSummitActiveCity = (config, kilometer) => normalizeSummitMapConfig(config).cities
  .filter((city) => Number(kilometer) >= Number(city.kilometer)
    && Number(kilometer) <= city.cityEndKilometer)
  .sort((first, second) => Number(second.kilometer) - Number(first.kilometer))[0] || null;

export const getSummitMapEventLocations = (config) => {
  const normalized = normalizeSummitMapConfig(config);
  const activeStation = normalized.stations.find(({ id }) => id === normalized.activeStationId);
  const occupiedKilometers = new Set();
  return [...(activeStation ? [activeStation] : []), ...normalized.cities]
    .filter((location) => (
      location.locationType === 'station'
      || (location.locationType === 'city' && location.kilometer > 0)
      || location.notificationEnabled
      || location.challengeEnabled
    ))
    .sort((first, second) => first.kilometer - second.kilometer)
    .filter((location) => {
      if (occupiedKilometers.has(location.kilometer)) return false;
      occupiedKilometers.add(location.kilometer);
      return true;
    });
};

export const getSummitMapEventLocation = (config, kilometer) => getSummitMapEventLocations(config)
  .find((location) => location.kilometer === Number(kilometer)) || null;

export const getNextSummitBlockingStation = (stages, fromKilometer, toKilometer) => (
  (Array.isArray(stages) ? stages : []).find((stage) => (
    Number(stage.points) > Number(fromKilometer || 0)
    && Number(stage.points) <= Number(toKilometer || 0)
    && !stage.completed
    && (
      stage.locationType === 'station'
      || stage.locationType === 'city'
      || stage.notificationEnabled
      || stage.challengeEnabled
    )
  )) || null
);
