export const version = '2026.08.17.4';

export async function up(connection) {
  await connection.query(`
    UPDATE app_settings
    SET setting_value = '20'
    WHERE setting_key = 'dailyChallengePoints'
      AND setting_value IN ('', '0')
  `);
  await connection.query(`
    UPDATE app_settings
    SET setting_value = '["size_ordering","color_difference","math_problems","instant_memory"]'
    WHERE setting_key = 'dailyChallengeGames'
      AND setting_value IN ('', '[]')
  `);
  await connection.query(`
    UPDATE app_settings
    SET setting_value = '[0,1,2,3,4,5,6]'
    WHERE setting_key = 'dailyChallengeDays'
      AND setting_value IN ('', '[]')
  `);
}
