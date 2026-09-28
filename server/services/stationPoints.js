import { normalizeSummitMapConfig } from '../../shared/summit-map.js';
import { validateManualPointsBatch } from './manualProgramPoints.js';

const fail = (message, statusCode = 422) => Object.assign(new Error(message), { statusCode });

export function requireActivePointsStation(settings, stationId) {
  if (!settings.pointsSystemEnabled || !settings.summitEnabled) throw fail('الخريطة أو نظام النقاط غير مفعّل.');
  const config = normalizeSummitMapConfig(settings.summitMapConfig);
  const station = config.stations.find(item => item.id === stationId);
  if (!station) throw fail('المحطة غير موجودة.', 404);
  if (config.activeStationId !== station.id) throw fail('فعّل المحطة قبل تسجيل النقاط.');
  return station;
}

// The caller holds a transaction and the map settings lock for the whole batch.
export async function saveStationPointsBatch(connection, { stationId, grades, actor, settings, date }, dependencies) {
  validateManualPointsBatch(grades);
  const station = requireActivePointsStation(settings, stationId);
  if (grades.some(row => row.points > station.rewardPoints)) throw fail('النقاط تتجاوز الحد المحدد للمحطة.');
  const results = [];
  for (const { studentId, points } of [...grades].sort((a, b) => a.studentId - b.studentId)) {
    const [[student]] = await connection.query('SELECT id, committee_id AS committeeId FROM students WHERE id = ? FOR UPDATE', [studentId]);
    if (!student) throw fail('الطالب غير موجود.', 404);
    if (actor.role === 'supervisor' || actor.role === 'reciter') {
      const [[scope]] = await connection.query('SELECT 1 AS allowed FROM supervisor_committees WHERE supervisor_id = ? AND committee_id = ? LIMIT 1', [actor.id, student.committeeId]);
      if (!scope) throw fail('يمكنك تسجيل نقاط طلاب حلقاتك فقط.', 403);
    }
    const [[previous]] = await connection.query('SELECT id, earned_points AS earnedPoints FROM student_station_points WHERE student_id = ? AND station_id = ? FOR UPDATE', [studentId, station.id]);
    const delta = points - Number(previous?.earnedPoints || 0);
    const [saved] = await connection.query(`INSERT INTO student_station_points (student_id, station_id, earned_points, completed_at)
      VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE earned_points = VALUES(earned_points), completed_at = NOW()`, [studentId, station.id, points]);
    if (delta) {
      await dependencies.applyStudentPointDelta(connection, studentId, delta, settings, { date });
      await dependencies.logStudentPointTransaction(connection, {
        studentId, supervisorId: actor.role === 'supervisor' ? actor.id : null,
        actorRole: actor.role, actorName: actor.name, type: delta > 0 ? 'increase' : 'deduction',
        points: Math.abs(delta), reason: `محطة: ${station.name}`, date, sourceType: 'summit_station', sourceId: previous?.id ?? saved.insertId,
      });
    }
    results.push({ studentId, earnedPoints: points, awardedPoints: delta });
  }
  return { grades: results };
}
