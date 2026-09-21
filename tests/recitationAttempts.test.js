import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { latestDailyTaskAttempts } from '../src/lib/recitationAttempts.js';
import { getNazemDeliveryFailure } from '../src/lib/nazemDeliveryStatus.js';
import { getRecitationStatusLabel } from '../src/lib/recitationEvaluation.js';

test('official completion takes precedence over a stale repeat label and numeric SQL flags are supported', () => {
  assert.equal(getRecitationStatusLabel({ teacherCompleted: true, teacherRatingKey: 'repeat_required' }), 'متقن');
  assert.equal(getRecitationStatusLabel({ teacherCompleted: 1, mistakeCount: 1, teacherRatingKey: 'repeat_required' }), '');
  assert.equal(getRecitationStatusLabel({ teacherCompleted: 0, nazemSource: true }), 'لم يُستكمل');
});

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('previous sessions keep only the latest result for each daily task', () => {
  const rows = [
    { id: 1, taskId: 20, studentId: 3, sessionDate: '2026-08-24', attemptNumber: 1, evaluatedAt: '2026-08-24 09:00' },
    { id: 2, taskId: 20, studentId: 3, sessionDate: '2026-08-24', attemptNumber: 2, evaluatedAt: '2026-08-24 10:00' },
    { id: 3, taskId: 21, studentId: 3, sessionDate: '2026-08-24', attemptNumber: 1, evaluatedAt: '2026-08-24 10:00' },
  ];

  assert.deepEqual(latestDailyTaskAttempts(rows).map((row) => row.id), [2, 3]);
});

test('an incomplete zero-error Nazem amount is not mislabeled as a failed recitation', () => {
  assert.equal(getRecitationStatusLabel({
    teacherCompleted: false,
    nazemSource: true,
    mistakeCount: 0,
    warningCount: 0,
  }), 'لم يُستكمل');
  assert.equal(getRecitationStatusLabel({
    teacherCompleted: false,
    nazemSource: true,
    mistakeCount: 1,
    warningCount: 0,
  }), 'يحتاج إعادة');
  assert.equal(getRecitationStatusLabel({
    teacherCompleted: false,
    nazemSource: false,
    mistakeCount: 0,
    warningCount: 0,
  }), 'يحتاج إعادة');
});

test('automatic Nazem supersession is not shown as a synchronization failure', () => {
  assert.equal(getNazemDeliveryFailure([{ syncStatus: 'dismissed' }]), null);
  assert.equal(getNazemDeliveryFailure([{ syncStatus: 'server_queued' }]), null);
  assert.equal(getNazemDeliveryFailure([{ syncStatus: 'failed' }])?.syncStatus, 'failed');
});

test('recitation retries are immutable attempts and the latest result remains authoritative', async () => {
  const [database, server] = await Promise.all([
    read('../server/db.js'),
    read('../server/index.js'),
  ]);

  assert.match(database, /CREATE TABLE IF NOT EXISTS student_quran_recitation_attempts/);
  assert.match(database, /UNIQUE KEY quran_recitation_attempt_number_unique \(task_id, attempt_number\)/);
  assert.match(database, /UNIQUE KEY quran_recitation_attempt_request_unique \(task_id, request_id\)/);
  assert.match(database, /INSERT INTO student_quran_recitation_attempts[\s\S]*WHERE t\.teacher_completed IS NOT NULL/);
  assert.match(server, /INSERT INTO student_quran_recitation_attempts[\s\S]*attemptNumber/);
  assert.match(server, /WHERE task_id = \? AND request_id = \?/);
  assert.match(server, /completed && task\.previousTeacherCompleted !== 1/);
  assert.match(server, /!completed && task\.previousTeacherCompleted !== 0/);
  assert.match(server, /FROM student_quran_recitation_attempts a[\s\S]*a\.attempt_number AS attemptNumber/);
  assert.match(server, /taskId: Number\(row\.taskId\)/);
  assert.match(server, /const currentMarks = wordMarks\.length \? wordMarks : ayahMarks/);
  assert.match(server, /historicalMarksByTaskDate/);
  assert.match(server, /marksFromPreviousAttempt/);
  assert.match(server, /JSON_LENGTH\(ayah_marks_json\) > 0 OR JSON_LENGTH\(word_marks_json\) > 0/);
  assert.match(server, /warningCount: currentMarks\.length \? detailedWarningCount/);
  assert.match(server, /mistakeCount: currentMarks\.length \? detailedMistakeCount/);
});

test('reverse Quran ranges preserve surah order while ayahs stay ascending', async () => {
  const [server, executionDialog, executionPolicy] = await Promise.all([
    read('../server/index.js'),
    read('../src/components/portal/QuranExecutionDialog.jsx'),
    read('../shared/quran-execution-policy.js'),
  ]);

  assert.match(server, /import \{[\s\S]*compareQuranPositionInDirection,[\s\S]*\} from '\.\.\/shared\/quran-execution-policy\.js'/);
  assert.match(server, /getQuranRangeDirection\(taskStartPosition\(first\), taskEndPosition\(first\)\)/);
  assert.match(executionDialog, /compareQuranPositionInDirection/);
  assert.match(executionDialog, /const direction = followsPlanDirection \? planDirection : taskDirection/);
  assert.match(executionPolicy, /Number\(second\.surah \|\| 0\) - Number\(first\.surah \|\| 0\)[\s\S]*Number\(first\.ayah \|\| 0\) - Number\(second\.ayah \|\| 0\)/);
});

test('retry source stays available across dates while completed local actions leave the active list', async () => {
  const [server, taskList, evaluation, mushaf, report] = await Promise.all([
    read('../server/index.js'),
    read('../src/components/portal/TeacherRecitationTaskList.jsx'),
    read('../src/components/portal/TeacherEvaluationDialog.jsx'),
    read('../src/components/portal/MushafRecitationDialog.jsx'),
    read('../src/components/dashboard/ReportsRecitationSessions.jsx'),
  ]);

  assert.match(server, /previous_attempt\.task_id = t\.id/);
  assert.match(server, /WHERE \(p\.status = 'active' OR \$\{retryableAttemptFilter\} OR \$\{studentExecutedMemorizationCondition\}\)/);
  assert.match(server, /MAX\(latest_attempt\.session_date\)/);
  assert.match(server, /attemptCount: Math\.max\(0, Number\(row\.attemptCount \|\| 0\)\)/);
  assert.match(server, /AND a\.teacher_completed = 1\s*\) AS successfulAttemptCount/);
  assert.match(server, /nazemSubmissionLocked: Boolean\(row\.nazemManaged\s*&& Number\(row\.attemptCount \|\| 0\) > 0\)/);
  assert.match(server.slice(server.indexOf('const nazemTeacherActionFilter'), server.indexOf('const [candidateRows]')), /buildNazemLateTaskExistsSql[\s\S]*actionAttempt\.teacher_completed = 1/);
  assert.match(taskList, /pendingTasks = student\.tasks\.filter\(isRecitationActionPending\)/);
  assert.match(taskList, /tasks: pendingTasks\.filter\(\(task\) => evaluationTypeForTask\(task\) === 'memorization'\)/);
  assert.match(taskList, /tasks: pendingTasks\.filter\(\(task\) => evaluationTypeForTask\(task\) === 'mastery'\)/);
  assert.match(taskList, /اكتمل التسميع/);
  assert.doesNotMatch(taskList, /إعادة إرسال|nazemRetryAvailable|retryingNazemTaskId/);
  assert.match(taskList, /\|\| nazemSubmissionLocked/);
  assert.match(server, /const nazemTeacherActionFilter/);
  assert.doesNotMatch(server, /quran-evaluation\/:taskId\/nazem-retry|nazemRetryAvailable/);
  assert.match(mushaf, /requestId: `\$\{saveRequestId\}:\$\{task\.id\}`/);
  assert.doesNotMatch(evaluation, /RecitationRetryConfirmationDialog|retryCandidate|تأكيد إعادة التسميع/);
  assert.match(evaluation, /const openRecitation = \(student\) => \{\s*prepareRecitation\(student\);\s*\}/);
  assert.doesNotMatch(evaluation, /setInterval\(refreshLocal, 10_000\)/);
  // Amount refresh is automatic; full plan discovery remains a manual operation.
  assert.doesNotMatch(evaluation, /refreshNazem/);
  assert.match(evaluation, /data\?\.nazemRefreshPending/);
  assert.match(report, /!row\.nazemSource[\s\S]*المحاولة \{formatNumber\(row\.attemptNumber \|\| 1\)\}/);
});

test('a combined memorization session evaluates each face independently and defers failures', async () => {
  const [server, evaluation, countDialog, mushaf] = await Promise.all([
    read('../server/index.js'),
    read('../src/components/portal/TeacherEvaluationDialog.jsx'),
    read('../src/components/portal/CountOnlyEvaluationDialog.jsx'),
    read('../src/components/portal/MushafRecitationDialog.jsx'),
  ]);
  const rewindStart = server.indexOf('async function rewindPlanAfterFailedMemorization');
  const rewindEnd = server.indexOf('function countUniquePagesWithinPlan', rewindStart);
  const rewindImplementation = server.slice(rewindStart, rewindEnd);

  assert.match(evaluation, /items=\{countEvaluationItems\(selectedStudent\?\.tasks\)\}/);
  assert.match(countDialog, /itemCounts\[String\(item\.id\)\]/);
  assert.match(mushaf, /marksByTask\[String\(activeEntry\.task\.id\)\]/);
  assert.match(server, /same_day_attempt\.session_date = \?/);
  assert.match(server, /scheduledMemorizationFaces \+ taskFaces > dailyMemorizationFaces/);
  assert.match(rewindImplementation, /sessionTaskIds = \[\]/);
  assert.match(rewindImplementation, /displaced\.id NOT IN/);
  assert.match(rewindImplementation, /displaced\.task_date >= \?/);
  assert.match(rewindImplementation, /DELETE FROM student_quran_tasks WHERE id IN/);
  assert.match(rewindImplementation, /ensureStudentPlanTasks\(connection, refreshedPlan, sessionDate, settings\)/);
  assert.match(rewindImplementation, /compareQuranPositionInDirection\(failedPosition, currentPosition, direction\) < 0/);
  assert.match(server, /recitationSessionTaskIds: sessionTaskIds/);
  assert.match(server, /JOIN student_quran_tasks attempted_task ON attempted_task\.id = same_day_attempt\.task_id/);
});
