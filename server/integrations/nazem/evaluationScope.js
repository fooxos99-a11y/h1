// Bind session date first, then the local plan's configured cutoff date.
export const nazemEvaluationEndDateSql = `CASE WHEN EXISTS (
  SELECT 1 FROM nazem_plan_links sessionLink
  JOIN nazem_accounts sessionAccount ON sessionAccount.teacher_id = sessionLink.teacher_id
    AND sessionAccount.status = 'connected'
  JOIN app_settings sessionSetting ON sessionSetting.setting_key = 'nazemIntegrationEnabled'
    AND sessionSetting.setting_value = 'true'
  WHERE sessionLink.ruwasi_plan_id = t.plan_id AND sessionLink.ruwasi_student_id = t.student_id
    AND sessionLink.sync_status NOT IN ('deleted','detached')
) THEN ? ELSE ? END`;
