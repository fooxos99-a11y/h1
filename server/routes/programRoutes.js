import { groupProgramSections } from '../../shared/program-sections.js';
import { countTrailingCharacter } from '../../shared/string-suffix.js';
import { saveProgramSections } from '../services/programSections.js';
import { saveManualProgramPoints, saveManualProgramPointsBatch } from '../services/manualProgramPoints.js';
import express from 'express';
import { deleteProgram } from '../services/deleteProgram.js';
import { db } from '../db.js';
import { requirePermission } from '../services/dashboardPermissions.js';

const FILE_PATTERN = /^data:[a-zA-Z0-9][a-zA-Z0-9.+/-]*;base64,[a-zA-Z0-9+/=]+$/;

const fail = (message, statusCode = 422) => Object.assign(new Error(message), { statusCode });
const clean = (value, max) => String(value || '').trim().slice(0, max);
const dataBytes = (value) => {
  const base64 = String(value || '').split(',')[1] || '';
  const padding = countTrailingCharacter(base64, '=');
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
};

export function normalizePayload(body = {}, child = false) {
  const sectionsEnabled = body.sectionsEnabled === true;
  if (child && sectionsEnabled) throw fail('لا يمكن إضافة أقسام داخل القسم.');
  if (sectionsEnabled && (!Array.isArray(body.sections) || !body.sections.length || body.sections.length > 30)) throw fail('أضف من قسم واحد إلى 30 قسمًا.');
  const title = clean(body.title, 180);
  const status = body.status === 'locked' ? 'locked' : 'open';
  const pointsReward = Math.trunc(Number(body.pointsReward || 0));
  const allowMultipleAttempts = body.allowMultipleAttempts === true;
  if (!title) throw fail('اسم المستوى مطلوب.');
  if (!sectionsEnabled && (!Number.isFinite(pointsReward) || pointsReward < 0 || pointsReward > 10000)) {
    throw fail('عدد الكيلومترات يجب أن يكون بين 0 و10000.');
  }

  const contents = normalizeProgramContents(body);

  const questions = (Array.isArray(body.questions) ? body.questions : []).slice(0, 100).map((item, index) => {
    const text = clean(item?.text, 500);
    const options = (Array.isArray(item?.options) ? item.options : []).slice(0, 6).map((option) => ({
      text: clean(option?.text, 300),
      isCorrect: option?.isCorrect === true,
    }));
    if (!text || options.length < 2 || options.some((option) => !option.text)) {
      throw fail(`السؤال رقم ${index + 1} يحتاج نصًا وخيارين على الأقل.`);
    }
    if (options.filter((option) => option.isCorrect).length !== 1) {
      throw fail(`حدد إجابة صحيحة واحدة للسؤال رقم ${index + 1}.`);
    }
    return { text, options };
  });
  return { title, status, pointsReward: sectionsEnabled ? 0 : pointsReward, allowMultipleAttempts: !child && !sectionsEnabled && allowMultipleAttempts, contents, questions: sectionsEnabled ? [] : questions,
    sections: sectionsEnabled ? body.sections.map(section => ({ ...normalizePayload(section, true), id: section.id })) : [] };
}

function normalizeProgramContents(body) {
  const submittedContents = Array.isArray(body.contents) ? body.contents : [];
  const text = String(submittedContents.find((item) => item?.type === 'text')?.value || '').trim();
  if (text.length > 20000) throw fail('النص يتجاوز الحد المسموح.');
  const contents = text ? [{ type: 'text', value: text, fileName: '', mimeType: '' }] : [];
  const attachment = submittedContents.find((item) => item?.type === 'file');
  if (attachment?.value) {
    const value = String(attachment.value).trim();
    if (!FILE_PATTERN.test(value) || dataBytes(value) > 10 * 1024 * 1024) {
      throw fail('الملف غير صالح أو يتجاوز حجمه 10 ميجابايت.');
    }
    contents.push({
      type: 'file',
      value,
      fileName: clean(attachment.fileName, 255) || 'ملف مرفق',
      mimeType: clean(attachment.mimeType, 120) || 'application/octet-stream',
    });
  }
  return contents;
}

async function loadPrograms({ studentId = null, pathId = null, includeAnswers = false } = {}) {
  const params = [];
  let where = '1 = 1';
  if (pathId) { where += ' AND (p.id = ? OR p.parent_path_id = ?)'; params.push(pathId, pathId); }
  if (studentId) { where += " AND p.status = 'open' AND (p.parent_path_id IS NULL OR EXISTS (SELECT 1 FROM learning_paths parent WHERE parent.id = p.parent_path_id AND parent.status = 'open'))"; }
  const [paths] = await db().query(
    `SELECT p.id, p.title, p.status, p.points_reward AS pointsReward,
      p.allow_multiple_attempts AS allowMultipleAttempts, p.parent_path_id AS parentPathId, EXISTS (SELECT 1 FROM learning_paths child WHERE child.parent_path_id = p.id) AS sectionsEnabled,
      p.sort_order AS sortOrder${studentId ? ', sp.score, sp.total_questions AS totalQuestions, sp.earned_points AS earnedPoints, sp.completed_at AS completedAt' : ''}
     FROM learning_paths p
     ${studentId ? 'LEFT JOIN student_path_progress sp ON sp.path_id = p.id AND sp.student_id = ?' : ''}
     WHERE ${where} ORDER BY p.sort_order ASC, p.id DESC`,
    studentId ? [studentId, ...params] : params
  );
  if (!paths.length) return [];
  const ids = paths.map((path) => Number(path.id));
  const placeholders = ids.map(() => '?').join(',');
  const [contents] = await db().query(
    `SELECT id, path_id AS pathId, block_type AS type, content_value AS value, file_name AS fileName, mime_type AS mimeType
     FROM learning_path_content_blocks WHERE path_id IN (${placeholders}) ORDER BY sort_order ASC, id ASC`, ids
  );
  const [questions] = await db().query(
    `SELECT id, path_id AS pathId, question_text AS text FROM learning_path_questions
     WHERE path_id IN (${placeholders}) ORDER BY sort_order ASC, id ASC`, ids
  );
  const questionIds = questions.map((question) => Number(question.id));
  let options = [];
  if (questionIds.length) {
    const [rows] = await db().query(
      `SELECT id, question_id AS questionId, option_text AS text${includeAnswers ? ', is_correct AS isCorrect' : ''}
       FROM learning_path_options WHERE question_id IN (${questionIds.map(() => '?').join(',')}) ORDER BY sort_order ASC, id ASC`, questionIds
    );
    options = rows;
  }
  const programs = paths.map((path) => ({
    ...path,
    id: Number(path.id),
    sectionsEnabled: Boolean(path.sectionsEnabled),
    pointsReward: Number(path.pointsReward || 0),
    allowMultipleAttempts: Boolean(path.allowMultipleAttempts),
    score: Number(path.score || 0),
    totalQuestions: Number(path.totalQuestions || 0),
    earnedPoints: Number(path.earnedPoints || 0),
    completedAt: path.completedAt || null,
    contents: contents.filter((item) => Number(item.pathId) === Number(path.id)).map((item) => ({ ...item, id: Number(item.id) })),
    questions: questions.filter((item) => Number(item.pathId) === Number(path.id)).map((question) => ({
      ...question,
      id: Number(question.id),
      options: options.filter((option) => Number(option.questionId) === Number(question.id)).map((option) => ({
        id: Number(option.id), text: option.text, ...(includeAnswers ? { isCorrect: Boolean(option.isCorrect) } : {}),
      })),
    })),
  }));
  const selected = pathId && programs.find(program => program.id === Number(pathId));
  return selected?.parentPathId ? [selected] : groupProgramSections(programs);
}

async function replaceProgramChildren(connection, pathId, payload) {
  await connection.query('DELETE FROM learning_path_content_blocks WHERE path_id = ?', [pathId]);
  await connection.query('DELETE FROM learning_path_questions WHERE path_id = ?', [pathId]);
  for (const [index, item] of payload.contents.entries()) {
    await connection.query(
      'INSERT INTO learning_path_content_blocks (path_id, block_type, content_value, file_name, mime_type, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [pathId, item.type, item.value, item.fileName || null, item.mimeType || null, index]
    );
  }
  for (const [questionIndex, question] of payload.questions.entries()) {
    const [result] = await connection.query(
      'INSERT INTO learning_path_questions (path_id, question_text, sort_order) VALUES (?, ?, ?)',
      [pathId, question.text, questionIndex]
    );
    for (const [optionIndex, option] of question.options.entries()) {
      await connection.query(
        'INSERT INTO learning_path_options (question_id, option_text, is_correct, sort_order) VALUES (?, ?, ?, ?)',
        [result.insertId, option.text, option.isCorrect ? 1 : 0, optionIndex]
      );
    }
  }
}

export function createProgramRouter({ loadSettings, applyStudentPointDelta, logStudentPointTransaction, getToday }) {
  const router = express.Router();
  const requireProgramManagement = (req, res, next) => {
    if (req.auth?.role === 'student') {
      return res.status(403).json({ message: 'ليس لديك صلاحية إدارة البرامج.' });
    }
    return requirePermission('programs')(req, res, next);
  };
  const ensureEnabled = async (_req, res, next) => {
    try {
      if (!(await loadSettings()).learningPathsEnabled) return res.status(404).json({ message: 'البرامج غير مفعلة.' });
      return next();
    } catch (error) { return next(error); }
  };

  router.get('/configuration', requireProgramManagement, async (_req, res, next) => {
    try {
      const settings = await loadSettings();
      return res.json({ learningPathsEnabled: Boolean(settings.learningPathsEnabled) });
    } catch (error) {
      return next(error);
    }
  });

  router.patch('/configuration', requireProgramManagement, async (req, res, next) => {
    try {
      const learningPathsEnabled = req.body.learningPathsEnabled === true;
      await db().query(
        `INSERT INTO app_settings (setting_key, setting_value) VALUES ('learningPathsEnabled', ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [String(learningPathsEnabled)],
      );
      return res.json({ learningPathsEnabled });
    } catch (error) {
      return next(error);
    }
  });

  router.use(ensureEnabled);
  router.get('/', async (req, res, next) => {
    try {
      const studentId = req.auth?.role === 'student' ? Number(req.auth.id) : null;
      res.json({ programs: await loadPrograms({ studentId, includeAnswers: !studentId }) });
    } catch (error) { next(error); }
  });
  router.post('/', requireProgramManagement, async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      const payload = normalizePayload(req.body);
      await connection.beginTransaction();
      const [result] = await connection.query(
        'INSERT INTO learning_paths (title, status, points_reward, allow_multiple_attempts, sort_order) VALUES (?, ?, ?, ?, ?)',
        [payload.title, payload.status, payload.pointsReward, payload.allowMultipleAttempts ? 1 : 0, Number(req.body.sortOrder || 0)]
      );
      await replaceProgramChildren(connection, result.insertId, payload);
      await saveProgramSections(connection, result.insertId, payload.sections, replaceProgramChildren);
      await connection.commit();
      res.status(201).json({ program: (await loadPrograms({ pathId: result.insertId, includeAnswers: true }))[0] });
    } catch (error) { await connection.rollback(); next(error); } finally { connection.release(); }
  });
  router.put('/:id', requireProgramManagement, async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      const payload = normalizePayload(req.body);
      await connection.beginTransaction();
      const [[current]] = await connection.query('SELECT parent_path_id AS parentPathId FROM learning_paths WHERE id = ? FOR UPDATE', [req.params.id]);
      if (current?.parentPathId) payload.allowMultipleAttempts = false;
      if (current?.parentPathId && payload.sections.length) throw fail('لا يمكن إضافة أقسام داخل القسم.');
      const [prior] = await connection.query('SELECT student_id FROM student_path_progress WHERE path_id = ? LIMIT 1', [req.params.id]);
      if (prior.length && payload.sections.length) throw fail('لا يمكن تحويل برنامج له نتائج إلى أقسام.');
      const [result] = await connection.query(
        'UPDATE learning_paths SET title = ?, status = ?, points_reward = ?, allow_multiple_attempts = ? WHERE id = ?',
        [payload.title, payload.status, payload.pointsReward, payload.allowMultipleAttempts ? 1 : 0, req.params.id]
      );
      if (!result.affectedRows) throw fail('المستوى غير موجود.', 404);
      await replaceProgramChildren(connection, req.params.id, payload);
      await saveProgramSections(connection, req.params.id, payload.sections, replaceProgramChildren);
      await connection.commit();
      res.json({ program: (await loadPrograms({ pathId: req.params.id, includeAnswers: true }))[0] });
    } catch (error) { await connection.rollback(); next(error); } finally { connection.release(); }
  });
  router.delete('/:id', requireProgramManagement, async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      await connection.beginTransaction();
      await deleteProgram(connection, req.params.id);
      await connection.commit();
      return res.json({ ok: true });
    } catch (error) { await connection.rollback(); return next(error); }
    finally { connection.release(); }
  });
  router.get('/:id/grades', requireProgramManagement, async (req, res, next) => {
    try {
      const scope = req.auth.role === 'supervisor';
      const [students] = await db().query(`SELECT s.id, s.name, sp.earned_points AS earnedPoints, sp.completed_at AS completedAt
        FROM students s LEFT JOIN student_path_progress sp ON sp.student_id = s.id AND sp.path_id = ?
        ${scope ? 'WHERE EXISTS (SELECT 1 FROM supervisor_committees sc WHERE sc.committee_id = s.committee_id AND sc.supervisor_id = ?)' : ''}
        ORDER BY s.name, s.id`, scope ? [req.params.id, req.auth.id] : [req.params.id]);
      res.json({ students });
    } catch (error) { next(error); }
  });
  router.put('/:id/grades', requireProgramManagement, async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      const settings = await loadSettings();
      await connection.beginTransaction();
      const result = await saveManualProgramPointsBatch(connection, {
        programId: Number(req.params.id), grades: req.body.grades,
        actor: req.auth, settings, date: getToday(),
      }, { applyStudentPointDelta, logStudentPointTransaction });
      await connection.commit();
      res.json(result);
    } catch (error) { await connection.rollback(); next(error); } finally { connection.release(); }
  });
  router.put('/:id/grades/:studentId', requireProgramManagement, async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      await connection.beginTransaction();
      const result = await saveManualProgramPoints(connection, {
        programId: Number(req.params.id), studentId: Number(req.params.studentId), points: req.body.points,
        actor: req.auth, settings: await loadSettings(), date: getToday(),
      }, { applyStudentPointDelta, logStudentPointTransaction });
      await connection.commit();
      res.json(result);
    } catch (error) { await connection.rollback(); next(error); } finally { connection.release(); }
  });
  router.post('/:id/submit', async (req, res, next) => {
    if (req.auth?.role !== 'student') return res.status(403).json({ message: 'التقييم متاح للطلاب فقط.' });
    const connection = await db().getConnection();
    try {
      const settings = await loadSettings();
      const [program] = await loadPrograms({ studentId: Number(req.auth.id), pathId: req.params.id, includeAnswers: true });
      if (!program) throw fail('المستوى غير موجود أو غير متاح.', 404);
      if (!program.questions.length) throw fail('لا توجد أسئلة في هذا المستوى.');
      const answers = req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
      const results = program.questions.map((question) => {
        const correct = question.options.find((option) => option.isCorrect);
        const selectedOptionId = Number(answers[question.id] || 0);
        return { questionId: question.id, selectedOptionId, correctOptionId: correct.id, correct: selectedOptionId === correct.id };
      });
      const score = results.filter((item) => item.correct).length;
      await connection.beginTransaction();
      await connection.query('SELECT id FROM students WHERE id = ? FOR UPDATE', [req.auth.id]);
      const [[previous]] = await connection.query(
        'SELECT score, earned_points AS earnedPoints FROM student_path_progress WHERE student_id = ? AND path_id = ? FOR UPDATE',
        [req.auth.id, req.params.id]
      );
      if (previous && !program.allowMultipleAttempts) throw fail('سبق لك إكمال هذا الاختبار.', 409);
      const targetPoints = settings.pointsSystemEnabled
        ? Math.round(program.pointsReward * score / program.questions.length)
        : 0;
      const delta = targetPoints - Number(previous?.earnedPoints || 0);
      if (delta) {
        await applyStudentPointDelta(connection, req.auth.id, delta, settings, { date: getToday() });
      }
      if (targetPoints > 0) {
        await logStudentPointTransaction(connection, {
          studentId: req.auth.id, actorRole: 'student', actorName: req.auth.name || 'الطالب',
          type: 'increase', points: targetPoints, reason: `إكمال برنامج: ${program.title}`,
          date: getToday(), sourceType: 'learning_path', sourceId: program.id,
          dedupeKey: `learning_path:${req.auth.id}:${program.id}`,
        });
      } else {
        await connection.query(
          'DELETE FROM student_point_transactions WHERE dedupe_key = ?',
          [`learning_path:${req.auth.id}:${program.id}`],
        );
      }
      await connection.query(
        `INSERT INTO student_path_progress (student_id, path_id, status, score, total_questions, earned_points, completed_at)
         VALUES (?, ?, 'completed', ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE status = 'completed', score = ?, total_questions = ?, earned_points = ?, completed_at = NOW()`,
        [req.auth.id, program.id, score, program.questions.length, targetPoints, score, program.questions.length, targetPoints]
      );
      await connection.commit();
      res.json({ score, totalQuestions: program.questions.length, earnedPoints: targetPoints, awardedPoints: delta, results });
    } catch (error) { await connection.rollback(); next(error); } finally { connection.release(); }
  });
  return router;
}
