import { dueNazemReconciliationPhases } from '../services/nazemReconciliationSchedule.js';
import { settleNazemPoints } from '../services/nazemPointReconciliation.js';
import '../loadEnvironment.js';
import { db, initDatabase, runWithDatabase } from '../db.js';
import { initPlatformDatabase, platformDb } from '../platformDb.js';
import {
  claimNextNazemJob,
  cleanupNazemHistory,
  completeNazemJob,
  failNazemJob,
  isNazemIntegrationEnabled,
  registerNazemCircuitSuccess,
  recoverExpiredNazemJobs,
  renewNazemJobLease,
  enqueueNazemFollowUpRefresh,
  enqueueNazemSyncJob,
} from '../integrations/nazem/queue.js';
import {
  applyNazemEntityFailure,
  enqueueMissingNazemRecitations,
  processNazemJob,
} from '../integrations/nazem/service.js';
import { getNazemRuntimeReadiness } from '../integrations/nazem/runtime.js';
import { buildNazemTenantScope } from '../integrations/nazem/tenantScope.js';
import { createIdlePollBackoff } from '../services/idlePollBackoff.js';
import { startRuntimeDiagnostics } from '../services/requestDiagnostics.js';

const POLL_INTERVAL_MS = Math.max(500, Number(process.env.NAZEM_WORKER_POLL_MS || 1_000));
const WORKER_CONCURRENCY = Math.min(4, Math.max(
  1,
  Number(process.env.NAZEM_WORKER_CONCURRENCY || 3),
));
const RECITATION_RECOVERY_MINUTES = Math.max(
  5,
  Number(process.env.NAZEM_RECITATION_RECOVERY_MINUTES || 15),
);
let stopping = false;
const lastCleanupBuckets = new Map();
const lastRecitationRecoveryBuckets = new Map();
const lastRuntimeWarningBuckets = new Map();
const tenantPoll = createIdlePollBackoff({ baseMs: POLL_INTERVAL_MS, maxMs: Math.max(POLL_INTERVAL_MS, 30_000) });
const lastMaintenanceAt = new Map();

const wait = (milliseconds) => new Promise((resolve) => {
  const timer = setTimeout(resolve, milliseconds);
  timer.unref?.();
});

async function listActiveTenants() {
  const defaultDatabase = process.env.MYSQL_DATABASE || 'wajeh_madarij';
  const [rows] = await platformDb().query(
    `SELECT registration_number AS registrationNumber, name, database_name AS databaseName
     FROM platform_complexes
     WHERE status = 'active' AND database_name IS NOT NULL
     ORDER BY id`,
  );
  return buildNazemTenantScope(rows, defaultDatabase);
}

async function cleanupTenantHistory(connection, databaseName) {
  const bucket = Math.floor(Date.now() / (24 * 60 * 60 * 1_000));
  if (lastCleanupBuckets.get(databaseName) === bucket) return;
  await cleanupNazemHistory(connection);
  lastCleanupBuckets.set(databaseName, bucket);
}

async function dismissLegacyAutomaticRefreshJobs(connection) {
  await connection.query(
    `UPDATE nazem_sync_jobs SET status = 'dismissed', lease_owner = NULL,
      lease_expires_at = NULL, last_error_code = 'NAZEM_MANUAL_REFRESH_ONLY',
      last_error = 'تحديث الطلاب والخطط متاح يدويًا فقط من إعدادات ناظم.'
     WHERE status IN ('pending','retrying')
       AND (
         (operation_type = 'account.reconcile'
           AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.requestedFrom')), '') <> 'student-plan-import')
         OR (operation_type = 'account.discover_plans'
           AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.requestedFrom')), '') = '')
       )`,
  );
  await connection.query(
    `UPDATE nazem_sync_jobs SET status = 'dismissed', lease_owner = NULL,
      lease_expires_at = NULL, last_error_code = 'NAZEM_ATTENDANCE_SKIPPED',
      last_error = 'أُلغيت مزامنة التسميع لأن الطالب غائب أو مستأذن.'
     WHERE status = 'blocked' AND last_error_code = 'NAZEM_ATTENDANCE_BLOCKS_RECITATION'`,
  );
  await connection.query(
    `UPDATE nazem_sync_jobs SET status = 'requires_review', lease_owner = NULL,
      lease_expires_at = NULL
     WHERE status = 'blocked' AND last_error_code = 'NAZEM_REVISION_RANGE_DISCONNECTED'`,
  );
}

async function recoverTenantRecitations(connection, databaseName) {
  const intervalMs = RECITATION_RECOVERY_MINUTES * 60 * 1_000;
  const bucket = Math.floor(Date.now() / intervalMs);
  if (lastRecitationRecoveryBuckets.get(databaseName) === bucket) return;

  const [accounts] = await connection.query(
    "SELECT teacher_id AS teacherId FROM nazem_accounts WHERE status = 'connected'",
  );
  for (const account of accounts) {
    await enqueueMissingNazemRecitations(connection, Number(account.teacherId));
  }

  await connection.query(
    `UPDATE nazem_daily_follow_up_links daily
     JOIN nazem_sync_jobs job ON job.operation_type = 'recitation.submit'
       AND job.entity_type = 'recitation_day' AND job.entity_id = daily.id
     SET daily.sync_status = 'pending', daily.last_error_code = NULL, daily.last_error = NULL
     WHERE job.status = 'failed'
       AND job.updated_at <= DATE_SUB(NOW(3), INTERVAL ? MINUTE)`,
    [RECITATION_RECOVERY_MINUTES],
  );
  await connection.query(
    `UPDATE nazem_recitation_links recitation
     JOIN nazem_sync_jobs job ON job.operation_type = 'recitation.submit'
       AND job.entity_type = 'recitation_day'
       AND job.entity_id = recitation.daily_follow_up_id
     SET recitation.sync_status = 'pending', recitation.last_error_code = NULL,
       recitation.last_error = NULL
     WHERE job.status = 'failed'
       AND job.updated_at <= DATE_SUB(NOW(3), INTERVAL ? MINUTE)`,
    [RECITATION_RECOVERY_MINUTES],
  );
  await connection.query(
    `UPDATE nazem_sync_jobs SET status = 'pending', attempt_count = 0,
      next_attempt_at = NOW(3), lease_owner = NULL, lease_expires_at = NULL,
      last_error_code = NULL, last_error = NULL
     WHERE operation_type = 'recitation.submit' AND status = 'failed'
       AND updated_at <= DATE_SUB(NOW(3), INTERVAL ? MINUTE)`,
    [RECITATION_RECOVERY_MINUTES],
  );
  lastRecitationRecoveryBuckets.set(databaseName, bucket);
}

async function reconcileTenantDay(connection) {
  const [refreshAccounts] = await connection.query("SELECT teacher_id AS teacherId FROM nazem_accounts WHERE status = 'connected'");
  for (const account of refreshAccounts) {
    await enqueueNazemFollowUpRefresh(connection, Number(account.teacherId));
  }
  const [[activation]] = await connection.query("SELECT setting_value AS value FROM app_settings WHERE setting_key = 'nazemPointsStartDate'");
  const phases = dueNazemReconciliationPhases(new Date(), activation?.value);
  if (phases.length) {
    const [accounts] = await connection.query("SELECT teacher_id AS teacherId FROM nazem_accounts WHERE status = 'connected'");
    for (const account of accounts) {
      const [existing] = await connection.query(`SELECT idempotency_key AS idempotencyKey FROM nazem_sync_jobs
        WHERE teacher_id = ? AND operation_type = 'account.daily_reconcile'`, [account.teacherId]);
      const keys = new Set(existing.map((job) => job.idempotencyKey));
      for (const phase of phases) {
        const idempotencyKey = `nazem:daily:${account.teacherId}:${phase.date}:${phase.phase}`;
        if (keys.has(idempotencyKey)) continue;
        await enqueueNazemSyncJob(connection, {
          teacherId: account.teacherId, operationType: 'account.daily_reconcile', entityType: 'account', entityId: account.teacherId,
          payload: { requestedFrom: 'daily-reconciliation', workDate: phase.date, phase: phase.phase },
          idempotencyKey,
        });
      }
    }
  }
  const [pending] = await connection.query(`SELECT work.daily_follow_up_id AS id FROM nazem_point_reconciliations work
    JOIN nazem_daily_follow_up_links daily ON daily.id = work.daily_follow_up_id
    WHERE work.status = 'pending' AND daily.sync_status = 'synced' ORDER BY work.updated_at LIMIT 25`);
  for (const row of pending) await settleNazemPoints(connection, row.id);
}

function startLeaseHeartbeat(job) {
  let active = true;
  let renewing = false;
  const timer = setInterval(async () => {
    if (!active || renewing) return;
    renewing = true;
    let connection;
    try {
      connection = await db().getConnection();
      active = await renewNazemJobLease(connection, job);
    } catch {
      active = false;
    } finally {
      renewing = false;
      connection?.release();
    }
  }, 45_000);
  timer.unref?.();
  return () => {
    active = false;
    clearInterval(timer);
  };
}

async function finalizeSuccessfulJob(connection, job, result) {
  let completed;
  await connection.beginTransaction();
  try {
    completed = await completeNazemJob(connection, job, result);
    if (completed) await registerNazemCircuitSuccess(connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function finalizeFailedJob(connection, job, error) {
  let status;
  await connection.beginTransaction();
  try {
    status = await failNazemJob(connection, job, error);
    if (status) await applyNazemEntityFailure(connection, job, error, status);
    await connection.commit();
  } catch (finalizationError) {
    await connection.rollback();
    throw finalizationError;
  }
}

async function prepareTenant(tenant) {
  await initDatabase(tenant.databaseName);
  return runWithDatabase(tenant.databaseName, { tenant }, async () => {
    const connection = await db().getConnection();
    try {
      if (!await isNazemIntegrationEnabled(connection)) return false;
      const runtime = await getNazemRuntimeReadiness();
      if (!runtime.ready) {
        const bucket = Math.floor(Date.now() / (60 * 60 * 1_000));
        if (lastRuntimeWarningBuckets.get(tenant.databaseName) !== bucket) {
          console.error(`Nazem worker tenant ${tenant.registrationNumber || tenant.databaseName} is not ready: ${runtime.issues.join(' ')}`);
          lastRuntimeWarningBuckets.set(tenant.databaseName, bucket);
        }
        return false;
      }
      await cleanupTenantHistory(connection, tenant.databaseName);
      if (Date.now() - (lastMaintenanceAt.get(tenant.databaseName) || 0) >= 60_000) {
        await dismissLegacyAutomaticRefreshJobs(connection);
        await recoverExpiredNazemJobs(connection);
        await reconcileTenantDay(connection);
        lastMaintenanceAt.set(tenant.databaseName, Date.now());
      }
      await recoverTenantRecitations(connection, tenant.databaseName);
      return true;
    } finally {
      connection.release();
    }
  });
}

async function processNextTenantJob(tenant) {
  return runWithDatabase(tenant.databaseName, { tenant }, async () => {
    const connection = await db().getConnection();
    try {
      const job = await claimNextNazemJob(connection);
      if (!job) return false;
      const started = Date.now();
      const stopHeartbeat = startLeaseHeartbeat(job);
      try {
        const result = await processNazemJob(job, connection);
        stopHeartbeat();
        await finalizeSuccessfulJob(connection, job, result);
      } catch (error) {
        stopHeartbeat();
        await finalizeFailedJob(connection, job, error);
      }
      process.stdout.write(`${JSON.stringify({ event: 'nazem_job_duration', jobId: job.id,
        operation: job.operationType, database: tenant.databaseName, durationMs: Date.now() - started })}\n`);
      return true;
    } finally {
      connection.release();
    }
  });
}

async function run() {
  startRuntimeDiagnostics();
  const defaultDatabase = process.env.MYSQL_DATABASE || 'wajeh_madarij';
  await initDatabase(defaultDatabase);
  await initPlatformDatabase();
  while (!stopping) {
    const tenants = await listActiveTenants();
    for (const tenant of tenants) {
      if (stopping) break;
      if (!tenantPoll.ready(tenant.databaseName)) continue;
      const ready = await prepareTenant(tenant).catch((error) => {
        console.error(`Nazem worker tenant ${tenant.registrationNumber || tenant.databaseName} failed:`, error.message);
        return false;
      });
      if (!ready) { tenantPoll.record(tenant.databaseName, false); continue; }
      const worked = await Promise.all(Array.from({ length: WORKER_CONCURRENCY }, () => (
        processNextTenantJob(tenant).catch((error) => {
          console.error(`Nazem worker tenant ${tenant.registrationNumber || tenant.databaseName} job failed:`, error.message);
        })
      )));
      tenantPoll.record(tenant.databaseName, worked.some(Boolean));
    }
    if (!stopping) await wait(POLL_INTERVAL_MS);
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
  });
}

run().catch((error) => {
  console.error('Nazem worker failed to start:', error.message);
  process.exitCode = 1;
});
