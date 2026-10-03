import express from 'express';
import { db } from '../db.js';
import { requirePermission } from '../services/dashboardPermissions.js';
import { requireActivePointsStation, saveStationPointsBatch } from '../services/stationPoints.js';

export function createStationPointsRouter({ loadSettings, applyStudentPointDelta, logStudentPointTransaction, getToday }) {
  const router = express.Router();
  router.use(requirePermission('settings'));
  router.get('/:id/grades', async (req, res, next) => {
    try {
      requireActivePointsStation(await loadSettings(), req.params.id);
      const scoped = ['supervisor', 'reciter'].includes(req.auth.role);
      const [students] = await db().query(`SELECT s.id, s.name, s.committee_id AS committeeId, c.name AS committeeName,
        p.earned_points AS earnedPoints, p.completed_at AS completedAt
        FROM students s LEFT JOIN committees c ON c.id = s.committee_id
        LEFT JOIN student_station_points p ON p.student_id = s.id AND p.station_id = ?
        ${scoped ? 'WHERE EXISTS (SELECT 1 FROM supervisor_committees sc WHERE sc.committee_id = s.committee_id AND sc.supervisor_id = ?)' : ''}
        ORDER BY s.name, s.id`, scoped ? [req.params.id, req.auth.id] : [req.params.id]);
      res.json({ students });
    } catch (error) { next(error); }
  });
  router.put('/:id/grades', async (req, res, next) => {
    let connection;
    try {
      connection = await db().getConnection();
      await connection.beginTransaction();
      const [rows] = await connection.query("SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN ('summitMapConfig', 'summitEnabled', 'pointsSystemEnabled') ORDER BY setting_key FOR UPDATE");
      const settings = { ...await loadSettings() };
      for (const row of rows) {
        const value = JSON.parse(row.setting_value);
        settings[row.setting_key] = row.setting_key === 'summitMapConfig' ? value : Boolean(settings[row.setting_key]) && value === true;
      }
      const result = await saveStationPointsBatch(connection, { stationId: req.params.id, grades: req.body?.grades, actor: req.auth, settings, date: getToday() }, { applyStudentPointDelta, logStudentPointTransaction });
      await connection.commit();
      res.json(result);
    } catch (error) {
      if (connection) {
        await connection.rollback();
      }
      next(error);
    }
    finally { connection?.release(); }
  });
  return router;
}
