import express from 'express';
import { db as defaultDb } from '../db.js';
import { requirePermission } from '../services/dashboardPermissions.js';
import { emptyStudentNews, visibleStudentNews } from '../../shared/student-news.js';
import { normalizeStudentNews } from '../services/studentNews.js';

export function createStudentNewsRouter({ getToday, db = defaultDb }) {
  const router = express.Router();
  const management = (req, res, next) => {
    if (!['admin', 'manager'].includes(req.auth?.role)) return res.status(403).json({ message: 'غير مصرح.' });
    return requirePermission('settings')(req, res, next);
  };
  const load = async () => {
    const [[row]] = await db().query('SELECT content, revision FROM student_news WHERE id = 1');
    return { ...emptyStudentNews(), ...JSON.parse(row?.content || '{}'), revision: Number(row?.revision || 0) };
  };
  router.get('/manage', management, async (_req, res, next) => {
    try { res.set('Cache-Control', 'no-store').json(await load()); } catch (error) { next(error); }
  });
  router.get('/audience', management, async (_req, res, next) => {
    try {
      const [students] = await db().query('SELECT id, name FROM students ORDER BY name');
      res.json(students);
    } catch (error) { next(error); }
  });
  router.put('/manage', management, async (req, res, next) => {
    try {
      const current = await load();
      if (current.revision !== req.body.revision) return res.status(409).json({ message: 'تغيرت الأخبار من مستخدم آخر؛ أعد تحميلها قبل الحفظ.' });
      const content = await normalizeStudentNews(req.body, current.images);
      if (content.studentIds.length) {
        const [rows] = await db().query('SELECT id FROM students WHERE id IN (?)', [content.studentIds]);
        if (rows.length !== content.studentIds.length) return res.status(422).json({ message: 'بعض الطلاب غير موجودين؛ أعد تحميل القائمة.' });
      }
      const [result] = await db().query('UPDATE student_news SET content = ?, revision = revision + 1 WHERE id = 1 AND revision = ?', [JSON.stringify(content), req.body.revision]);
      if (!result.affectedRows) return res.status(409).json({ message: 'تغيرت الأخبار من مستخدم آخر؛ أعد تحميلها قبل الحفظ.' });
      res.json({ ...content, revision: req.body.revision + 1 });
    } catch (error) { next(error); }
  });
  router.get('/', async (req, res, next) => {
    if (req.auth?.role !== 'student') return res.status(403).json({ message: 'غير مصرح.' });
    try { res.set('Cache-Control', 'no-store').json(visibleStudentNews(await load(), req.auth.id, getToday())); }
    catch (error) { next(error); }
  });
  return router;
}
