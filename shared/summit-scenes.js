export const SUMMIT_MAX_ROAD_SEGMENTS = 8;
export const normalizeSummitImageId = (value) => /^[a-f0-9]{64}$/.test(String(value || '')) ? String(value) : '';

export function normalizeSummitCityScenes(city, endKilometer) {
  const start = city.kilometer;
  const end = Math.max(start, endKilometer);
  const cityEndKilometer = Math.min(end, Math.max(start, Math.trunc(Number(city.cityEndKilometer ?? start + 500) || 0)));
  let from = cityEndKilometer + 1;
  const source = Array.isArray(city.roads) && city.roads.length ? city.roads : [{}];
  const roads = source.slice(0, SUMMIT_MAX_ROAD_SEGMENTS).flatMap((road, index, items) => {
    if (from > end) return [];
    const toKilometer = index === items.length - 1 ? end
      : Math.min(end, Math.max(from, Math.trunc(Number(road.toKilometer ?? end) || 0)));
    const segment = { fromKilometer: from, toKilometer, imageId: normalizeSummitImageId(road.imageId) };
    from = toKilometer + 1;
    return [segment];
  });
  return { endKilometer: end, cityEndKilometer, imageId: normalizeSummitImageId(city.imageId), roads };
}

export function getSummitScene(config, kilometer) {
  const distance = Math.max(0, Math.floor(Number(kilometer) || 0));
  const city = [...(config?.cities || [])].reverse().find((item) => distance >= item.kilometer && distance <= item.endKilometer);
  if (!city) return null;
  if (distance <= city.cityEndKilometer) return { kind: 'city', imageId: city.imageId, city };
  const road = city.roads.find((item) => distance >= item.fromKilometer && distance <= item.toKilometer);
  return road ? { kind: 'road', imageId: road.imageId, city, road } : null;
}
