export const version = '2026.08.24.10.3';

async function columnExists(connection, table, column) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column],
  );
  return Number(row.count) > 0;
}

async function indexExists(connection, table, index) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    [table, index],
  );
  return Number(row.count) > 0;
}

async function constraintExists(connection, table, constraint) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.table_constraints
     WHERE constraint_schema = DATABASE() AND table_name = ? AND constraint_name = ?`,
    [table, constraint],
  );
  return Number(row.count) > 0;
}

async function addCheck(connection, table, name, expression) {
  if (!await constraintExists(connection, table, name)) {
    await connection.query(`ALTER TABLE ${table} ADD CONSTRAINT ${name} CHECK (${expression})`);
  }
}

export async function up(connection) {
  if (!await columnExists(connection, 'nazem_accounts', 'identity_confirmed_fingerprint')) {
    await connection.query(
      'ALTER TABLE nazem_accounts ADD COLUMN identity_confirmed_fingerprint CHAR(64) NULL AFTER identity_confirmed_by',
    );
  }
  if (!await columnExists(connection, 'nazem_sync_jobs', 'last_heartbeat_at')) {
    await connection.query(
      'ALTER TABLE nazem_sync_jobs ADD COLUMN last_heartbeat_at DATETIME(3) NULL AFTER lease_expires_at',
    );
  }
  if (!await columnExists(connection, 'nazem_sync_conflicts', 'open_entity_key')) {
    await connection.query(
      `ALTER TABLE nazem_sync_conflicts ADD COLUMN open_entity_key VARCHAR(190)
       GENERATED ALWAYS AS (CASE WHEN status = 'open' THEN CONCAT(entity_type, ':', entity_id) ELSE NULL END) STORED`,
    );
  }
  if (!await indexExists(connection, 'nazem_sync_conflicts', 'nazem_sync_conflicts_open_unique')) {
    await connection.query(
      'ALTER TABLE nazem_sync_conflicts ADD UNIQUE KEY nazem_sync_conflicts_open_unique (teacher_id, open_entity_key)',
    );
  }
  if (!await indexExists(connection, 'nazem_sync_events', 'nazem_sync_events_created_lookup')) {
    await connection.query('ALTER TABLE nazem_sync_events ADD INDEX nazem_sync_events_created_lookup (created_at)');
  }
  if (!await indexExists(connection, 'nazem_sync_jobs', 'nazem_sync_jobs_cleanup_lookup')) {
    await connection.query(
      'ALTER TABLE nazem_sync_jobs ADD INDEX nazem_sync_jobs_cleanup_lookup (status, last_succeeded_at)',
    );
  }
  if (!await indexExists(connection, 'nazem_student_candidates', 'nazem_student_candidates_cleanup_lookup')) {
    await connection.query(
      'ALTER TABLE nazem_student_candidates ADD INDEX nazem_student_candidates_cleanup_lookup (last_seen_at)',
    );
  }

  await addCheck(connection, 'nazem_accounts', 'nazem_accounts_status_check',
    "status IN ('pending','verifying','connected','retrying','requires_review','failed','blocked')");
  await addCheck(connection, 'nazem_student_links', 'nazem_student_links_status_check',
    "status IN ('linked','requires_review','unlinked')");
  await addCheck(connection, 'nazem_plan_links', 'nazem_plan_links_status_check',
    "sync_status IN ('pending','syncing','synced','retrying','blocked','requires_review','conflict','failed','deleted','detached')");
  await addCheck(connection, 'nazem_recitation_links', 'nazem_recitation_links_status_check',
    "sync_status IN ('pending','syncing','synced','retrying','blocked','requires_review','conflict','failed')");
  await addCheck(connection, 'nazem_sync_jobs', 'nazem_sync_jobs_status_check',
    "status IN ('pending','syncing','synced','retrying','blocked','requires_review','conflict','failed','dismissed')");
  await addCheck(connection, 'nazem_sync_conflicts', 'nazem_sync_conflicts_status_check',
    "status IN ('open','resolved')");
  await addCheck(connection, 'nazem_circuit_breakers', 'nazem_circuit_breakers_state_check',
    "state IN ('closed','open','half_open')");
}

export async function down(connection) {
  const checks = [
    ['nazem_accounts', 'nazem_accounts_status_check'],
    ['nazem_student_links', 'nazem_student_links_status_check'],
    ['nazem_plan_links', 'nazem_plan_links_status_check'],
    ['nazem_recitation_links', 'nazem_recitation_links_status_check'],
    ['nazem_sync_jobs', 'nazem_sync_jobs_status_check'],
    ['nazem_sync_conflicts', 'nazem_sync_conflicts_status_check'],
    ['nazem_circuit_breakers', 'nazem_circuit_breakers_state_check'],
  ];
  for (const [table, constraint] of checks) {
    if (await constraintExists(connection, table, constraint)) {
      await connection.query(`ALTER TABLE ${table} DROP CHECK ${constraint}`);
    }
  }
  await connection.query('ALTER TABLE nazem_student_candidates DROP INDEX nazem_student_candidates_cleanup_lookup');
  await connection.query('ALTER TABLE nazem_sync_jobs DROP INDEX nazem_sync_jobs_cleanup_lookup');
  await connection.query('ALTER TABLE nazem_sync_events DROP INDEX nazem_sync_events_created_lookup');
  await connection.query('ALTER TABLE nazem_sync_conflicts DROP INDEX nazem_sync_conflicts_open_unique');
  await connection.query('ALTER TABLE nazem_sync_conflicts DROP COLUMN open_entity_key');
  await connection.query('ALTER TABLE nazem_sync_jobs DROP COLUMN last_heartbeat_at');
  await connection.query('ALTER TABLE nazem_accounts DROP COLUMN identity_confirmed_fingerprint');
}
