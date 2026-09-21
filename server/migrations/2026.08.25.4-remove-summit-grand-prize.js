export const version = '2026.08.25.4';

export async function up(connection) {
  await connection.query("DELETE FROM app_settings WHERE setting_key = 'summitGrandPrize'");
  const [[gamesSetting]] = await connection.query(
    "SELECT setting_value AS value FROM app_settings WHERE setting_key = 'dailyChallengeGames' LIMIT 1",
  );
  if (gamesSetting) {
    let games;
    try {
      games = JSON.parse(gamesSetting.value || '[]');
    } catch {
      games = [];
    }
    const nextGames = Array.isArray(games) ? games.filter((game) => game !== 'summit_camp') : [];
    await connection.query(
      "UPDATE app_settings SET setting_value = ? WHERE setting_key = 'dailyChallengeGames'",
      [JSON.stringify(nextGames)],
    );
  }
  await connection.query(
    "DELETE FROM daily_challenge_attempts WHERE game_type = 'summit_camp' AND status = 'started'",
  );
}
