import { nazemTaskTrack } from './taskTrack.js';
import { reconcileNazemReview } from './reviewIdentity.js';
import { loadNazemPlanLinkCount } from './planLinkCount.js';
import { latestNazemScheduleSql } from './scheduleAuthority.js';

const supportedTaskTypes = new Set(['memorization', 'review']);

const exactRangeMatches = (tasks, day) => {
  const first = tasks[0];
  const last = tasks.at(-1);
  return Boolean(first && last
    && Number(first.fromSurah) === Number(day.surah_from)
    && Number(first.fromAyah) === Number(day.verse_from)
    && Number(last.toSurah) === Number(day.surah_to)
    && Number(last.toAyah) === Number(day.verse_to));
};

async function loadAyahPage(connection, surah, ayah) {
  const [[row]] = await connection.query(
    `SELECT page_number AS page FROM quran_ayah_pages
     WHERE surah_number = ? AND ayah_number = ? LIMIT 1`,
    [Number(surah), Number(ayah)],
  );
  return Number(row?.page || 0);
}

async function insertTaskRange(connection, {
  plan, date, taskType, fromPage, toPage, fromSurah, fromAyah, toSurah, toAyah, nazemReviewId = null,
}) {
  const targetPages = Math.max(0.25, Math.abs(Number(toPage) - Number(fromPage)) + 1);
  await connection.query(
    `INSERT INTO student_quran_tasks
      (plan_id, student_id, task_date, task_type, track, from_page, to_page,
       from_surah, from_ayah, to_surah, to_ayah, target_pages,
       normal_to_page, normal_to_surah, normal_to_ayah,
       scheduled_to_page, scheduled_to_surah, scheduled_to_ayah, nazem_review_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [plan.id, plan.studentId, date, taskType, plan.track, fromPage, toPage,
      fromSurah, fromAyah, toSurah, toAyah, targetPages,
      toPage, toSurah, toAyah, toPage, toSurah, toAyah, nazemReviewId],
  );
}

async function replaceUntouchedTaskType(connection, {
  plan,
  date,
  taskType,
  fromPage,
  toPage,
  fromSurah,
  fromAyah,
  toSurah,
  toAyah,
  nazemReviewId = null,
}) {
  const [tasks] = await connection.query(
    `SELECT t.id, t.from_surah AS fromSurah, t.from_ayah AS fromAyah,
      t.to_surah AS toSurah, t.to_ayah AS toAyah, t.student_status AS studentStatus,
      t.teacher_completed AS teacherCompleted, t.evaluated_at AS evaluatedAt,
      t.execution_actor_role AS executionActorRole,
      EXISTS (SELECT 1 FROM student_quran_recitation_attempts a WHERE a.task_id = t.id) AS hasAttempt,
      EXISTS (SELECT 1 FROM student_quran_task_ayah_marks m WHERE m.task_id = t.id) AS hasAyahMarks,
      EXISTS (SELECT 1 FROM student_quran_task_word_marks w WHERE w.task_id = t.id) AS hasWordMarks
     FROM student_quran_tasks t
     WHERE t.plan_id = ? AND t.student_id = ? AND t.task_date = ? AND t.task_type = ? AND t.track = ?
     ORDER BY t.from_page, t.from_surah, t.from_ayah FOR UPDATE`,
    [plan.id, plan.studentId, date, taskType, plan.track],
  );
  if (exactRangeMatches(tasks, { surah_from: fromSurah, verse_from: fromAyah, surah_to: toSurah, verse_to: toAyah })) {
    return { matched: true, changed: false };
  }
  const touched = tasks.some((task) => (
    !['pending', 'not_done'].includes(task.studentStatus)
    || task.teacherCompleted != null
    || task.evaluatedAt
    || task.executionActorRole
    || Number(task.hasAttempt)
    || Number(task.hasAyahMarks)
    || Number(task.hasWordMarks)
  ));
  if (touched) return { matched: false, changed: false, reason: 'task_started' };

  if (tasks.length) {
    await connection.query(
      `DELETE FROM student_quran_tasks WHERE id IN (${tasks.map(() => '?').join(', ')})`,
      tasks.map((task) => Number(task.id)),
    );
  }
  await insertTaskRange(connection, {
    plan, date, taskType, fromPage, toPage, fromSurah, fromAyah, toSurah, toAyah, nazemReviewId,
  });
  return { matched: true, changed: true };
}

export async function syncNazemScheduledTaskRange(connection, link, day, { inTransaction = false } = {}) {
  if (inTransaction) return syncScheduledRange(connection, link, day);
  await connection.beginTransaction();
  try {
    const result = await syncScheduledRange(connection, link, day);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function syncScheduledRange(connection, link, day) {
  const taskType = String(day?.taskType || '');
  if (!supportedTaskTypes.has(taskType)) return { matched: false, changed: false, reason: 'unsupported_type' };
  if (taskType === 'review' && ((Number(link.teacherId) || 0) <= 0)) {
    return { matched: false, changed: false, reason: 'teacher_missing' };
  }
  const values = [day.surah_from, day.verse_from, day.surah_to, day.verse_to].map(Number);
  if (values.some((value) => !Number.isInteger(value) || value < 1)) {
    return { matched: false, changed: false, reason: 'invalid_range' };
  }
  const [[plan]] = await connection.query(
    `SELECT id, student_id AS studentId, track, link_pages AS linkPages FROM student_quran_plans
     WHERE id = ? AND student_id = ? AND status = 'active' LIMIT 1 FOR UPDATE`,
    [Number(link.planId), Number(link.studentId)],
  );
  if (!plan) return { matched: false, changed: false, reason: 'plan_missing' };
  plan.track = nazemTaskTrack(day, plan.track);
  plan.teacherId = Number(link.teacherId);
  if (taskType === 'memorization' && plan.track !== 'mastery' && plan.teacherId > 0) {
    plan.linkPages = await loadNazemPlanLinkCount(connection, link) ?? plan.linkPages;
  }
  let dailyId = null;
  dailyId = await upsertScheduledDailyLink({ link, connection, plan, day, taskType, dailyId });
  const [fromPage, toPage] = await Promise.all([
    loadAyahPage(connection, values[0], values[1]),
    loadAyahPage(connection, values[2], values[3]),
  ]);
  if (!fromPage || !toPage) return { matched: false, changed: false, reason: 'ayah_page_missing' };

  if (taskType === 'review') {
    const result = await reconcileScheduledReviewRange({ connection, plan, day, values, dailyId, fromPage, toPage });
    if (result) return result;
  }

  const primary = await replaceUntouchedTaskType(connection, {
    plan,
    date: day.date,
    taskType,
    fromPage,
    toPage,
    fromSurah: values[0],
    fromAyah: values[1],
    toSurah: values[2],
    toAyah: values[3],
    nazemReviewId: taskType === 'review' ? dailyId : null,
  });
  if (!primary.matched || taskType !== 'memorization') return primary;
  await ensureScheduledLinkTask({ plan, connection, day, fromPage, toPage, values });
  const repeat = await replaceUntouchedTaskType(connection, {
    plan,
    date: day.date,
    taskType: 'repeat',
    fromPage,
    toPage,
    fromSurah: values[0],
    fromAyah: values[1],
    toSurah: values[2],
    toAyah: values[3],
  });
  return { matched: true, changed: primary.changed || repeat.changed };
}

/** Add a missing link task without overwriting an existing assignment. */
async function ensureScheduledLinkTask({ plan, connection, day, fromPage, toPage, values }) {
  if (plan.track !== 'mastery' && Number(plan.linkPages) > 0) {
    const [[existingLink]] = await connection.query(
      `SELECT id FROM student_quran_tasks WHERE plan_id = ? AND student_id = ?
       AND task_date = ? AND task_type = 'link' LIMIT 1`, [plan.id, plan.studentId, day.date]
    );
    if (!existingLink) await replaceUntouchedTaskType(connection, {
      plan, date: day.date, taskType: 'link', fromPage, toPage,
      fromSurah: values[0], fromAyah: values[1], toSurah: values[2], toAyah: values[3],
    });
  }
}

/** Store the remote schedule using bound values without replacing a pending local submission snapshot. */
async function upsertScheduledDailyLink({ link, connection, plan, day, taskType, dailyId }) {
  if (Number(link.teacherId || 0) > 0) {
    const [daily] = await connection.query(
      `INSERT INTO nazem_daily_follow_up_links
        (ruwasi_plan_id, ruwasi_student_id, teacher_id, follow_up_date, task_type, track,
         nazem_record_id, sync_status, last_remote_checked_at, remote_snapshot)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NOW(3), ?)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id),
         nazem_record_id = IF(local_snapshot IS NULL, COALESCE(VALUES(nazem_record_id), nazem_record_id), nazem_record_id),
         sync_status = IF(sync_status = 'synced', sync_status, 'pending'),
         last_remote_checked_at = NOW(3), remote_snapshot = ${latestNazemScheduleSql}`,
      [plan.id, plan.studentId, Number(link.teacherId), day.date, taskType, plan.track,
      day.id == null ? null : String(day.id), JSON.stringify(day)]
    );
    dailyId = Number(daily.insertId);
  }
  return dailyId;
}


/** Reconcile review identities without overwriting work already recorded locally. */
async function reconcileScheduledReviewRange({ connection, plan, day, values, dailyId, fromPage, toPage }) {
    const review = await reconcileNazemReview(connection, plan, day.date, {
      fromSurah: values[0], fromAyah: values[1], toSurah: values[2], toAyah: values[3],
    }, dailyId);
    if (review.keeper) return { matched: true, changed: review.changed };
    if (review.preserveExisting) {
      await insertTaskRange(connection, {
        plan, date: day.date, taskType: 'review', fromPage, toPage,
        fromSurah: values[0], fromAyah: values[1], toSurah: values[2], toAyah: values[3],
        nazemReviewId: dailyId,
      });
      return { matched: true, changed: true };
    }
  }
