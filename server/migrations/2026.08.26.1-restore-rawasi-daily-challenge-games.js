import { DAILY_CHALLENGE_GAME_TYPES } from '../../shared/daily-challenge.js';

export const version = '2026.08.26.1';

export async function up(connection) {

  const [[setting]] = await connection.query(
    "SELECT setting_value AS value FROM app_settings WHERE setting_key = 'dailyChallengeGames' LIMIT 1",
  );
  if (!setting) return;

  let games;
  try {
    games = JSON.parse(setting.value || '[]');
  } catch {
    games = [];
  }
  if (!Array.isArray(games) || games.length !== 1 || games[0] !== 'summit_cave') return;

  await connection.query(
    "UPDATE app_settings SET setting_value = ? WHERE setting_key = 'dailyChallengeGames'",
    [JSON.stringify(DAILY_CHALLENGE_GAME_TYPES)],
  );
}
