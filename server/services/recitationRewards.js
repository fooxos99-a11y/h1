import { normalizeRecitationRewardSettings } from '../../shared/recitation-reward-settings.js';
import { applyPlatformPolicies, readPlatformPoliciesFromRows } from './platformSettingPolicies.js';
import { enforcePointsFeatureDependencies } from '../../shared/points-feature-settings.js';

export const calculateEvaluatedGroupReward = (tasks = []) => (
  tasks.length && tasks.every((task) => task.evaluatedAt && Number(task.teacherCompleted) === 1)
    ? Math.max(0, Math.round(tasks.reduce((sum, task) => sum + Number(task.evaluationScore || 0), 0) / tasks.length))
    : 0
);

export async function loadRecitationRewardSettings(connection) {
  const [rows] = await connection.query('SELECT setting_key, setting_value FROM app_settings');
  return enforcePointsFeatureDependencies(applyPlatformPolicies(
    normalizeRecitationRewardSettings(Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]))),
    readPlatformPoliciesFromRows(rows),
  ));
}
