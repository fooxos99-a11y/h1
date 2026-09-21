import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { DAILY_CHALLENGE_GAMES } from '../shared/daily-challenge.js';
import { createSummitChallenge, createSummitGameChallenge, scoreSummitChallenge } from '../shared/summit-engine.js';
import {
  SUMMIT_MAP_CHALLENGES,
  SUMMIT_STAGES,
  getSummitChallengeTitle,
  getSummitProgressSummary,
  normalizeSummitStageChallenges,
} from '../shared/summit.js';
import {
  SUMMIT_CITY_SCENE_LENGTH_KILOMETERS,
  getSummitActiveCity,
  getSummitActiveStation,
  getNextSummitBlockingStation,
  getSummitMapEventLocations,
  getSummitMapTotalKilometers,
  normalizeSummitMapConfig,
} from '../shared/summit-map.js';
import {
  QASSIM_GOAL_REVEAL_AT_KM,
  QASSIM_GOVERNORATES,
  QASSIM_ROUTE_POINTS,
  getQassimRoadProgress,
  getQassimRoutePosition,
} from '../src/components/summit/qassimMapData.js';

test('summit journey has eight ordered milestones and exact progress math', () => {
  assert.deepEqual(SUMMIT_STAGES.map((stage) => stage.points), [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000]);
  assert.deepEqual(SUMMIT_STAGES.map((stage) => stage.name), ['عنيزة', 'المذنب', 'الرس', 'البدائع', 'البكيرية', 'عيون الجواء', 'الأسياح', 'الهدف النهائي']);
  assert.deepEqual(getSummitProgressSummary(2450), {
    points: 2450,
    percentage: 30.63,
    nextStage: SUMMIT_STAGES[2],
    remaining: 550,
    reachedSummit: false,
  });
});

test('qassim map starts in Buraidah, labels every governorate, and keeps the goal anonymous', () => {
  assert.equal(QASSIM_ROUTE_POINTS[0].key, 'buraidah');
  assert.equal(QASSIM_ROUTE_POINTS[0].points, 0);
  assert.equal(QASSIM_ROUTE_POINTS.at(-1).key, 'mystery-goal');
  assert.equal(QASSIM_ROUTE_POINTS.at(-1).points, 8000);
  assert.deepEqual(
    new Set(QASSIM_GOVERNORATES.map(({ name }) => name)),
    new Set(['بريدة', 'عنيزة', 'الرس', 'المذنب', 'البكيرية', 'البدائع', 'الأسياح', 'عيون الجواء']),
  );
  assert.deepEqual(getQassimRoutePosition(0), { x: 455, y: 1020 });
  assert.deepEqual(getQassimRoutePosition(8000), QASSIM_ROUTE_POINTS.at(-1));
  assert.equal(QASSIM_GOAL_REVEAL_AT_KM, 7000);
  assert.deepEqual(getQassimRoadProgress(6500), {
    distanceKm: 6500,
    segmentIndex: 6,
    segmentProgress: 0.5,
    goalProximity: 0,
    goalVisible: false,
  });
  assert.equal(getQassimRoadProgress(7000).goalVisible, true);
  assert.equal(getQassimRoadProgress(7500).goalProximity, 0.5);
  assert.equal(getQassimRoadProgress(8000).goalProximity, 1);
});

test('map configuration supports global station events, hundred-kilometer cities, and target-bounded signs', () => {
  const config = normalizeSummitMapConfig({
    cities: [{ key: 'mithnab', name: 'مدينة المذنب' }],
    stations: [
      { id: 'quiet', name: 'محطة هادئة', kilometer: 1200 },
      { id: 'notice', name: 'محطة إشعار', kilometer: 2200, notificationEnabled: true, notificationText: 'وصلت' },
      { id: 'game', name: 'محطة تحدي', kilometer: 3200, challengeEnabled: true, challengeType: 'cave' },
    ],
    signs: [{ id: 'manual', kilometer: 1000, text: 'المذنب ١٠٠٠ كم', side: 'right' }],
    activeStationId: 'notice',
  });
  assert.equal(config.cities.find(({ key }) => key === 'mithnab').name, 'مدينة المذنب');
  assert.deepEqual(config.stations.map(({ notificationEnabled, challengeEnabled }) => [notificationEnabled, challengeEnabled]), [[false, false], [true, false], [false, true]]);
  assert.ok(config.stations.every(({ kilometer }) => kilometer > 0));
  assert.equal(getSummitActiveStation(config)?.id, 'notice');
  assert.deepEqual(config.signs[0], { id: 'manual', kilometer: 1000, visibleFromKilometer: 0, text: 'المذنب ١٠٠٠ كم', side: 'right', enabled: true });
  assert.equal(getNextSummitBlockingStation(config.stations.map((station) => ({ ...station, points: station.kilometer })), 1000, 3500)?.id, 'quiet');
  assert.equal(getNextSummitBlockingStation(config.stations.map((station) => ({ ...station, points: station.kilometer, completed: true })), 2200, 3500), null);

  const startConfig = normalizeSummitMapConfig({
    stations: [{ id: 'start-station', name: 'محطة البداية', kilometer: 0 }],
    signs: [{ id: 'start-sign', kilometer: 0, text: 'ابدأ من هنا' }],
  });
  assert.equal(startConfig.stations[0].kilometer, 0);
  assert.equal(startConfig.signs[0].kilometer, 0);
  assert.equal(startConfig.signs[0].visibleFromKilometer, 0);
  assert.equal('visibleUntilKilometer' in startConfig.signs[0], false);

  const cityEventConfig = normalizeSummitMapConfig({
    cities: [{ id: 'new-city', name: 'مدينة جديدة', kilometer: 1750, challengeEnabled: true, challengeType: 'forest', rewardPoints: 85 }],
    stations: [],
  });
  assert.deepEqual(getSummitMapEventLocations(cityEventConfig).map(({ id, kilometer, rewardPoints }) => ({ id, kilometer, rewardPoints })), [
    { id: 'new-city', kilometer: 1750, rewardPoints: 85 },
  ]);
  assert.equal(getSummitActiveCity(cityEventConfig, 1750)?.id, 'new-city');
  assert.equal(getSummitActiveCity(cityEventConfig, 1750 + SUMMIT_CITY_SCENE_LENGTH_KILOMETERS - 1)?.id, 'new-city');
  assert.equal(getSummitActiveCity(cityEventConfig, 1750 + SUMMIT_CITY_SCENE_LENGTH_KILOMETERS + 1), null);
  assert.deepEqual(getSummitMapEventLocations(config).filter(({ locationType }) => locationType === 'station').map(({ id }) => id), ['notice']);
});

test('the final destination and city distances drive the real journey progress', () => {
  const config = normalizeSummitMapConfig({
    goal: { enabled: true, name: 'واحة الإنجاز', kilometer: 10000, revealDistance: 750 },
    cities: [
      { id: 'start', name: 'البداية', kilometer: 0 },
      { id: 'middle', name: 'المدينة الوسطى', kilometer: 3500 },
      { id: 'last', name: 'المدينة الأخيرة', kilometer: 7200 },
    ],
    stations: [],
  });
  assert.equal(getSummitMapTotalKilometers(config), 10000);
  assert.deepEqual(config.goal, {
    enabled: true,
    name: 'واحة الإنجاز',
    kilometer: 10000,
    revealDistance: 750,
  });
  assert.deepEqual(getSummitMapEventLocations(config).map(({ name, kilometer }) => ({ name, kilometer })), [
    { name: 'المدينة الوسطى', kilometer: 3500 },
    { name: 'المدينة الأخيرة', kilometer: 7200 },
  ]);
  assert.deepEqual(getQassimRoadProgress(2000, {
    totalKilometers: 10000,
    cities: config.cities,
    goal: config.goal,
  }), {
    distanceKm: 2000,
    segmentIndex: 0,
    segmentProgress: 2000 / 3500,
    goalProximity: 0,
    goalVisible: false,
  });
  assert.equal(getQassimRoadProgress(9250, {
    totalKilometers: 10000,
    cities: config.cities,
    goal: config.goal,
  }).goalVisible, true);

  const withoutGoal = normalizeSummitMapConfig({
    goal: { enabled: false, kilometer: 10000 },
    cities: config.cities,
    stations: [],
  });
  assert.equal(getSummitMapTotalKilometers(withoutGoal), 7200);
});

test('map starts without generated stations and only removes untouched legacy defaults', () => {
  assert.deepEqual(normalizeSummitMapConfig({}).stations, []);
  assert.deepEqual(normalizeSummitMapConfig({
    stations: [{
      id: 'station-unaizah',
      name: 'عنيزة',
      kilometer: 1000,
      visibleFromKilometer: 0,
      visibleUntilKilometer: 1000,
      notificationEnabled: true,
      notificationText: 'وصلت إلى عنيزة',
      challengeEnabled: true,
      challengeType: 'summit_forest',
      rewardPoints: 50,
    }],
  }).stations, []);
  const customizedStation = normalizeSummitMapConfig({
    stations: [{
      id: 'station-unaizah',
      name: 'عنيزة',
      kilometer: 1000,
      visibleFromKilometer: 500,
      visibleUntilKilometer: 1000,
      notificationEnabled: true,
      notificationText: 'وصلت إلى عنيزة',
      challengeEnabled: true,
      challengeType: 'summit_forest',
      rewardPoints: 50,
    }],
  }).stations[0];
  assert.equal(customizedStation.id, 'station-unaizah');
  assert.equal('visibleFromKilometer' in customizedStation, false);
});

test('all map events normalize legacy challenge names and reward is capped', () => {
  const configuredChallenges = normalizeSummitStageChallenges({ 1000: 'cave', 2000: 'forest' });
  SUMMIT_STAGES.slice(0, -1).forEach((stage) => {
    const challenge = createSummitChallenge(stage.points, configuredChallenges[stage.points]);
    assert.ok(SUMMIT_MAP_CHALLENGES.some(({ type }) => type === `summit_${challenge.type}`));
  });
  assert.deepEqual(
    [createSummitChallenge(1000, 'cave'), createSummitChallenge(2000, 'forest')].map(({ type }) => type),
    ['cave', 'forest'],
  );
  assert.equal(createSummitChallenge(1000, 'invalid').type, 'forest');
  assert.equal(createSummitChallenge(0, 'cave').type, 'cave');
  assert.equal(createSummitChallenge(1750, 'forest').type, 'forest');
  assert.equal(createSummitChallenge(1750, 'invalid').type, 'forest');
  assert.equal(getSummitChallengeTitle('camp'), '');
  const forest = createSummitGameChallenge('forest');
  const score = scoreSummitChallenge(forest, {
    trace: forest.solution.map(([x, y]) => ({ x, y })),
  }, 1, 45);
  assert.equal(score.completed, true);
  assert.ok(score.reward > 0 && score.reward <= 50);
});

test('summit is wired as a responsive student journey with protected persistence', async () => {
  const [server, routes, migration, removalMigration, portal, gateway, hero, map, overview, roadScene, mapStyles, mapArtwork, mapData, goalMarker, journeySection, game, settings, mapEditor, mapEventFields, students, teacherTasks] = await Promise.all([
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/routes/summitRoutes.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/migrations/2026.08.24.1-summit.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/migrations/2026.08.25.4-remove-summit-grand-prize.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AccountPortal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/LoginGateway.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/public/PublicHeroSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/summit/SummitJourneyMap.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/summit/QassimOverviewMap.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/summit/QassimRoadScene.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/summit/SummitJourneyMap.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/summit/QassimMapArtwork.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/summit/qassimMapData.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/summit/MysteryGoalMarker.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/SummitJourneySection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/summit/SummitMiniGame.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/SettingsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/SummitMapEditor.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/SummitMapEventFields.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/StudentsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/TeacherRecitationTaskList.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(routes, /req\.auth\?\.role !== 'student'/);
  assert.match(server, /studentSummitAccess/);
  assert.match(routes, /FOR UPDATE/);
  assert.match(routes, /SELECT points AS rankingPoints FROM students/);
  assert.match(migration, /student_summit_attempts/);
  assert.doesNotMatch(portal, /label: 'القمّة'/);
  assert.match(hero, />\s*الخريطة\s*</);
  assert.match(hero, /<Button/);
  assert.match(hero, /site\.whiteLogo/);
  assert.doesNotMatch(hero, /SummitWoodButton/);
  assert.match(gateway, /showPath=\{studentFeatures\.summitEnabled\}/);
  assert.doesNotMatch(hero, /نرتقي بالقرآن/);
  assert.doesNotMatch(map, /summit-journey-landmarks-v5\.png|SUMMIT_MAP_IMAGE_URL/);
  assert.match(map, /embedded \? 'map' : 'road'/);
  assert.match(map, /embedded \? 'is-embedded h-full' : 'h-dvh'/);
  assert.match(map, /showViewToggle = !embedded/);
  assert.match(map, /showViewToggle &&/);
  assert.match(map, /QassimRoadScene/);
  assert.match(map, /QassimOverviewMap/);
  assert.doesNotMatch(map, /sticky bottom-0/);
  assert.doesNotMatch(map, /MapPin/);
  assert.match(overview, /موقعك الحالي/);
  assert.match(overview, /journey\.stages\.filter/);
  assert.match(overview, /QassimMapArtwork/);
  assert.match(overview, /SummitMapControls/);
  assert.match(overview, /roadProgress\.goalVisible &&/);
  assert.match(roadScene, /getQassimRoadProgress/);
  assert.match(roadScene, /progress\.goalVisible &&/);
  assert.match(roadScene, /routeOptions\.totalKilometers\.toLocaleString/);
  assert.match(roadScene, /leaving-city/);
  assert.match(roadScene, /open-road/);
  assert.match(roadScene, /approaching-city/);
  assert.match(roadScene, /city-entrance/);
  assert.match(roadScene, /city-interior/);
  assert.match(roadScene, /qassim-road-station\.webp/);
  assert.match(roadScene, /progress\.segmentIndex % 2 === 0 \? 'day' : 'night'/);
  assert.match(roadScene, /distanceAhead >= 0/);
  assert.match(roadScene, /currentKilometer >= visibleFrom/);
  assert.match(roadScene, /currentKilometer <= visibleUntil/);
  assert.match(roadScene, /qassim-road-station/);
  assert.doesNotMatch(roadScene, /qassim-road-station-place/);
  assert.doesNotMatch(roadScene, /qassim-road-city-arrival/);
  assert.match(roadScene, /getSummitActiveCity\(journey\.mapConfig, progress\.distanceKm\)/);
  assert.match(roadScene, /getSummitActiveStation\(journey\.mapConfig\)/);
  assert.doesNotMatch(roadScene, /qassim-road-guidance|qassim-road-km-post/);
  assert.doesNotMatch(overview, /summit-start-marker|بداية الرحلة من بريدة/);
  assert.doesNotMatch(journeySection, />رجوع</);
  assert.match(mapStyles, /summit-stage-sign/);
  assert.match(mapStyles, /qassim-route-progress/);
  assert.match(mapStyles, /qassim-road-backdrop/);
  assert.match(mapStyles, /qassim-road-scene\.is-night/);
  assert.match(mapStyles, /\.qassim-road-station \{[\s\S]*?top: calc\(env\(safe-area-inset-top\) \+ 1rem\);[\s\S]*?left: 50%;[\s\S]*?transform: translateX\(-50%\)/);
  assert.match(mapStyles, /touch-action: pan-x pan-y/);
  assert.match(mapArtwork, /pathLength="8000"/);
  assert.match(mapArtwork, /SummitMapStationLandmarks/);
  assert.match(mapData, /QASSIM_GOVERNORATES/);
  assert.match(goalMarker, /الهدف النهائي/);
  assert.doesNotMatch(journeySection, /SummitWoodButton/);
  assert.match(mapStyles, /prefers-reduced-motion/);
  assert.doesNotMatch(mapStyles, /summit-(?:view-toggle|map-balance|map-controls)[\s\S]{0,80}position: fixed/);
  assert.doesNotMatch(journeySection, /رحلة المغامرة|<Mountain/);
  assert.doesNotMatch(journeySection, /preloadMap|new Image\(\)/);
  assert.match(journeySection, /getSummitJourneyCached\(\{ refresh: true \}\)/);
  assert.match(journeySection, /حُفظت نتيجة التحدي/);
  assert.match(journeySection, /Number\(stage\.points\) === initialKilometers/);
  assert.match(journeySection, /لقد وصلت إلى محطة/);
  assert.match(routes, /stages\/:points\/acknowledge/);
  assert.match(journeySection, /fixed inset-0 z-\[90\] h-dvh overflow-hidden/);
  assert.match(journeySection, /overlayClassName="z-\[150\]"/);
  assert.match(overview, /summit-map-viewport/);
  assert.match(mapArtwork, /viewBox=/);
  assert.doesNotMatch(`${map}\n${mapArtwork}`, /stage\.icon|🧗|🔒|🌲|⛺/);
  assert.match(game, /ForestMazeGame/);
  assert.match(settings, /label="تفعيل الخريطة"/);
  assert.doesNotMatch(settings, /htmlFor="summitGrandPrize"|اسم جائزة الوصول إلى القمّة/);
  assert.doesNotMatch(`${server}\n${routes}\n${journeySection}\n${settings}`, /summitGrandPrize|grandPrize/);
  assert.match(removalMigration, /DELETE FROM app_settings WHERE setting_key = 'summitGrandPrize'/);
  assert.match(settings, /title="الخريطة والتحدي اليومي"/);
  assert.match(settings, />الخريطة</);
  assert.match(mapEventFields, /مكافأة الفوز بالتحدي/);
  assert.match(settings, /SummitMapEditor/);
  assert.ok(mapEditor.indexOf('كيلومتر الهدف') < mapEditor.indexOf('تظهر من كيلومتر'));
  assert.ok(mapEditor.indexOf('تظهر من كيلومتر') < mapEditor.indexOf('إظهار اللوحة'));
  assert.match(mapEditor, /الوجهة النهائية/);
  assert.match(mapEditor, /كشف الاسم قبل الوصول بـ/);
  assert.match(mapEditor, /<SummitJourneyMap embedded/);
  assert.match(mapEditor, /notificationEnabled/);
  assert.match(mapEditor, /challengeEnabled/);
  assert.match(mapEditor, /config\.signs/);
  assert.match(server, /summitMapConfig/);
  assert.match(routes, /getSummitMapEventLocation/);
  assert.match(routes, /student_summit_progress/);
  assert.match(journeySection, /requestAnimationFrame/);
  assert.match(journeySection, /updateSummitProgress/);
  assert.match(journeySection, /displayedKilometers === finalTarget/);
  assert.match(journeySection, /movingForward \? getNextSummitBlockingStation/);
  assert.match(routes, /ON DUPLICATE KEY UPDATE kilometers = VALUES\(kilometers\)/);
  assert.doesNotMatch(routes, /journey: await loadJourney/);
  assert.doesNotMatch(students, /كيلومترات رحلة القمّة/);
  assert.match(`${map}\n${roadScene}`, /كيلومتر|كم/);
  assert.match(teacherTasks, /repeatEditable = teacherExecutionMode/);
  assert.doesNotMatch(teacherTasks, /repeatControl = \(showAmounts \|\| nazemManaged\)/);
});

test('forest challenge uses a changing modern maze with harder continuous collision checks', async () => {
  const [maze, engine, hero] = await Promise.all([
    readFile(new URL('../src/components/summit/ForestMazeGame.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../shared/summit-engine.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/public/PublicHeroSection.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(maze, /onPointerDown=\{beginDrag\}/);
  assert.match(maze, /onPointerMove=\{drag\}/);
  assert.match(maze, /setPointerCapture/);
  assert.match(maze, /touch-none/);
  assert.match(maze, /segmentPoints\(positionRef\.current, next\)/);
  assert.match(maze, /challenge\.stones\.every/);
  assert.match(engine, /isForestTraceValid/);
  assert.match(engine, /FOREST_WALL_Y_VALUES = \[80, 60, 40, 20\]/);
  assert.match(engine, /createForestGaps/);
  assert.match(engine, /delete publicChallenge\.solution/);
  assert.match(maze, /المتاهة تتغير في كل محاولة/);
  assert.match(maze, /forest.*tree|gradientId.*tree/s);
  assert.doesNotMatch(hero, /left-1\/2[^\n]*animate=\{\{ y/);
});

test('map exposes every daily challenge while keeping the two summit-native games touch friendly', async () => {
  const [router, caveGame, styles, engine, dailyChallenge, gamePicker, routes, gameFiles] = await Promise.all([
    readFile(new URL('../src/components/summit/SummitMiniGame.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/summit/games/CaveMemoryGame.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/summit/summitMiniGames.css', import.meta.url), 'utf8'),
    readFile(new URL('../shared/summit-engine.js', import.meta.url), 'utf8'),
    readFile(new URL('../shared/daily-challenge.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/DailyChallengeGamePicker.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../server/routes/summitRoutes.js', import.meta.url), 'utf8'),
    readdir(new URL('../src/components/summit/games/', import.meta.url)),
  ]);
  assert.match(router, /ForestMazeGame/);
  assert.match(router, /CaveMemoryGame/);
  assert.deepEqual(gameFiles, ['CaveMemoryGame.jsx']);
  assert.equal(createSummitGameChallenge('waterfall'), null);
  assert.doesNotMatch(`${router}\n${engine}\n${styles}`, /WaterfallCrossing|BridgeBalance|FallingRocks|BasecampGear|waterfall-game|bridge-scene|rocks-scene|gear-items/);
  assert.match(caveGame, /setPreviewStep/);
  assert.match(styles, /touch-action: manipulation/);
  assert.match(styles, /font-family: var\(--font-ui\)/);
  assert.deepEqual(SUMMIT_MAP_CHALLENGES, DAILY_CHALLENGE_GAMES.map(({ value, label }) => ({ type: value, title: label })));
  assert.match(dailyChallenge, /تذكر الأضواء/);
  assert.doesNotMatch(`${dailyChallenge}\n${gamePicker}`, /summit_camp|تجهيز حقيبة|جهّز حقيبتك/);
  assert.doesNotMatch(`${dailyChallenge}\n${gamePicker}`, /عبور الشلال|توازن الجسر|تفادي الصخور/);
  assert.doesNotMatch(dailyChallenge, /تجهيز معدات القمة/);
  assert.match(routes, /createDailyChallenge\(gameType\)/);
  assert.match(routes, /isDailyChallengeCorrect\(gameType, challenge, req\.body\)/);
});


test('each city stays visible through its first 500 kilometers before the road resumes', () => {
  for (const [distance, name] of [[0, 'بريدة'], [500, 'بريدة'], [501, null], [999, null], [1000, 'عنيزة'], [1001, 'عنيزة'], [1500, 'عنيزة'], [1501, null], [2000, 'المذنب'], [2500, 'المذنب'], [2501, null]]) {
    assert.equal(getSummitActiveCity(undefined, distance)?.name || null, name, `distance ${distance}`);
  }
});
