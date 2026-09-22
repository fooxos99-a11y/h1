import test from 'node:test';
import assert from 'node:assert/strict';
import { getSummitJourneyBoardText } from '../shared/summit-journey-board.js';

test('journey board always follows the next city and switches to the gathering name', () => {
  const journey = { points: 200, totalKilometers: 8000, mapConfig: {
    cities: [{ name: 'الثانية', kilometer: 2000 }, { name: 'الأولى', kilometer: 1000 }],
    goal: { enabled: true, name: 'النهاية', kilometer: 8000, revealDistance: 1000 },
  } };
  assert.equal(getSummitJourneyBoardText(journey), 'المتبقي إلى الأولى: 800 كم');
  assert.equal(getSummitJourneyBoardText({ ...journey, points: 1000 }), 'المتبقي إلى الثانية: 1,000 كم');
  assert.equal(getSummitJourneyBoardText({ ...journey, activeStation: { name: 'التجمع' } }), 'التجمع');
  assert.equal(getSummitJourneyBoardText({ ...journey, points: 7500 }), 'المتبقي إلى النهاية: 500 كم');
  assert.equal(getSummitJourneyBoardText({ ...journey, points: 9000 }), 'وصلت');
  assert.equal(getSummitJourneyBoardText({ ...journey, points: 3000 }), 'المتبقي إلى الوجهة التالية: 5,000 كم');
});
