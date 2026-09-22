import test from 'node:test';
import assert from 'node:assert/strict';
import { loadJourney } from '../server/routes/summitRoutes.js';
import { normalizeSummitMapConfig } from '../shared/summit-map.js';

const station = { id: 'meeting', name: 'ملتقى الطلاب', kilometer: 2500, challengeEnabled: true,
  notificationEnabled: true, imageId: 'a'.repeat(64) };
test('gathering stations retain valid images and never have challenges or arrival notifications', () => {
  const config = normalizeSummitMapConfig({ stations: [station] });
  assert.equal(config.stations[0].challengeEnabled, false);
  assert.equal(config.stations[0].notificationEnabled, false);
  assert.equal(config.stations[0].imageId, station.imageId);
  assert.equal(normalizeSummitMapConfig({ stations: [{ ...station, imageId: '../image' }] }).stations[0].imageId, '');
});
test('all students gather regardless of points or previous completion and return to current earned points', async () => {
  let points = 0;
  const connection = { query: async sql => {
    if (sql.includes('FROM students')) return [[{ rankingPoints: points }]];
    if (sql.includes('FROM student_summit_stage_rewards')) return [[{ stagePoints: 2500, completedAt: '2026-09-01' }]];
    assert.fail(`Gathering must not alter or restore stored progress: ${sql}`);
  } };
  const settings = { summitEnabled: true, summitMapConfig: { cities: [], stations: [station], activeStationId: station.id } };
  for (points of [0, 100, 7000]) {
    const journey = await loadJourney(connection, 1, settings);
    assert.equal(journey.displayedKilometers, 2500);
    assert.equal(journey.activeStation.id, station.id);
    assert.equal(journey.points, points);
  }
  points = 7150;
  settings.summitMapConfig.activeStationId = null;
  const released = await loadJourney(connection, 1, settings);
  assert.equal(released.activeStation, null);
  assert.equal(released.displayedKilometers, 7150);
});
