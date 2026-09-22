import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('cultural competitions retain the complete Afaneen question sets and image assets', async () => {
  const letterHive = await import('../src/components/games/letter-hive/letterHiveData.js');
  const categories = await import('../src/components/games/categories/categoriesData.js');
  const auction = await import('../src/components/games/auction/auctionData.js');
  const guessImage = await import('../src/components/games/guess-image/guessImageData.js');
  const images = await readdir(new URL('../public/guess-images/rebus/', import.meta.url));

  assert.equal(Object.keys(letterHive.LETTER_HIVE_QUESTIONS).length, 28);
  assert.equal(Object.values(letterHive.LETTER_HIVE_QUESTIONS).flat().length, 1083);
  assert.equal(categories.DEFAULT_CATEGORIES.length, 17);
  assert.equal(categories.DEFAULT_CATEGORIES.flatMap((category) => category.questions).length, 790);
  assert.equal(auction.AUCTION_QUESTIONS.length, 56);
  assert.equal(guessImage.GUESS_IMAGE_STAGES.length, 3);
  assert.equal(guessImage.GUESS_IMAGE_QUESTIONS.length, 30);
  assert.equal(images.filter((name) => name.endsWith('.png')).length, 30);
});

test('cultural competitions are routed for management and teachers, configurable, and database-backed', async () => {
  const [app, dashboard, portal, sectionRoutes, navigation, clientPermissions, serverPermissions, settingsCatalog, api, migration, server] = await Promise.all([
    read('src/App.jsx'),
    read('src/pages/WajehDashboard.jsx'),
    read('src/pages/AccountPortal.jsx'),
    read('src/lib/sectionRoutes.js'),
    read('src/lib/culturalCompetitionNavigation.js'),
    read('src/lib/dashboardPermissions.js'),
    read('server/services/dashboardPermissions.js'),
    read('shared/platform-settings-catalog.js'),
    read('server/routes/culturalGamesRoutes.js'),
    read('server/migrations/2026.08.17.2-cultural-competitions.js'),
    read('server/index.js'),
  ]);

  for (const route of ['/letter-hive', '/categories-game', '/auction-game', '/guess-image-game']) {
    assert.match(app, new RegExp(route.replace('/', '\\/')));
  }
  for (const source of [dashboard, clientPermissions, serverPermissions]) {
    assert.match(source, /culturalCompetition/);
  }
  assert.match(portal, /CulturalCompetitionSection/);
  assert.match(portal, /key: 'culturalCompetition'/);
  assert.match(sectionRoutes, /\['culturalCompetition', 'cultural-competitions'\]/);
  assert.match(navigation, /role === 'supervisor'/);
  assert.match(api, /req\.auth\?\.role === 'supervisor'/);
  assert.match(server, /supervisorCulturalCompetitionAccess[\s\S]*path\.startsWith\('\/cultural-games'\)/);
  assert.match(settingsCatalog, /culturalCompetitionSectionEnabled/);
  assert.match(api, /x-game-control-token/);
  assert.match(api, /requireCulturalCompetition/);
  assert.match(migration, /cultural_game_sessions/);
  assert.match(migration, /cultural_game_used_questions/);
  assert.match(migration, /cultural_game_question_banks/);
});

test('cultural competition cards show standalone gold icons without background tiles', async () => {
  const section = await read('src/components/dashboard/CulturalCompetitionSection.jsx');
  const iconButton = section.match(/<button[\s\S]*?className="([^"]+)"[\s\S]*?<Icon className="h-8 w-8"/);

  assert.ok(iconButton);
  assert.match(iconButton[1], /text-\[#d7a43b\]/);
  assert.doesNotMatch(iconButton[1], /(?:^|\s)(?:bg-|border(?:-|\s)|rounded-)/);
});

test('only letter hive exposes a working phone-accessible presenter QR entry', async () => {
  const [presenter, letterHive, letterHiveStyles, categories, auction, guessStage, guessTeams, originHook, server] = await Promise.all([
    read('src/components/games/shared/GamePresenterLink.jsx'),
    read('src/components/games/letter-hive/LetterHiveTeamsView.jsx'),
    read('src/components/games/letter-hive/letterHive.css'),
    read('src/components/games/categories/CategoriesTeamsView.jsx'),
    read('src/components/games/auction/AuctionTeamsView.jsx'),
    read('src/components/games/guess-image/GuessImageStageView.jsx'),
    read('src/components/games/guess-image/GuessImageTeamsView.jsx'),
    read('src/hooks/useGamePresenterOrigin.js'),
    read('server/routes/culturalGamesRoutes.js'),
  ]);

  assert.match(presenter, /href=\{url\}/);
  assert.match(presenter, /QRCode\.toDataURL/);
  assert.match(letterHive, /GamePresenterLink/);
  assert.match(letterHiveStyles, /\.letter-hive-qr-card \.game-presenter-link-card[\s\S]*?border: 0;[\s\S]*?background: transparent;/);
  for (const view of [categories, auction, guessStage, guessTeams]) assert.doesNotMatch(view, /GamePresenterLink/);
  assert.match(originHook, /presenter-origin/);
  assert.match(server, /getLocalNetworkAddress/);
});

test('auction dialog actions keep equal usable widths without overlapping', async () => {
  const styles = await read('src/components/games/auction/auctionGame.css');
  assert.match(styles, /\.auction-modal-actions[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.auction-modal-actions > button[\s\S]*?width: 100%[\s\S]*?min-width: 0/);
  assert.match(styles, /@media \(max-width: 520px\)[\s\S]*?\.auction-modal-actions \{ grid-template-columns: 1fr; \}/);
});

test('every cultural game celebrates winners with fullscreen fireworks and white team names', async () => {
  const [effects, effectStyles, letter, categories, auction, guessImage] = await Promise.all([
    read('src/components/games/shared/WinEffects.jsx'),
    read('src/components/games/shared/winEffects.css'),
    read('src/components/games/letter-hive/LetterHiveFinishOverlay.jsx'),
    read('src/components/games/categories/CategoriesWinnerModal.jsx'),
    read('src/components/games/auction/AuctionWinnerDialog.jsx'),
    read('src/components/games/guess-image/GuessImageBoardView.jsx'),
  ]);

  assert.match(effects, /game-win-firework/);
  assert.match(effectStyles, /prefers-reduced-motion: reduce/);
  for (const view of [letter, categories, guessImage]) assert.match(view, /<WinEffects fullscreen/);
  assert.match(auction, /celebrate/);

  const winnerStyles = await Promise.all([
    read('src/components/games/letter-hive/letterHive.css'),
    read('src/components/games/categories/categoriesGame.css'),
    read('src/components/games/auction/auctionGame.css'),
    read('src/components/games/guess-image/guessImage.css'),
  ]);
  for (const styles of winnerStyles) assert.match(styles, /color: #fff/);
});
