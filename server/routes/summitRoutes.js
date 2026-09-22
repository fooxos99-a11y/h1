import express from 'express';
import { db } from '../db.js';
import {
  getSummitChallengeTitle,
  getSummitProgressSummary,
  normalizeSummitChallengeType,
} from '../../shared/summit.js';
import { SUMMIT_DAILY_CHALLENGE_GAME_TYPES } from '../../shared/daily-challenge.js';
import {
  createDailyChallenge,
  isDailyChallengeCorrect,
  sanitizeDailyChallenge,
} from '../../shared/daily-challenge-engine.js';
import {
  getSummitMapEventLocation,
  getSummitMapEventLocations,
  getSummitActiveStation,
  getSummitMapTotalKilometers,
  normalizeSummitMapConfig,
} from '../../shared/summit-map.js';
import {
  scoreSummitChallenge,
} from '../../shared/summit-engine.js';

const fail = (message, statusCode = 422) => Object.assign(new Error(message), { statusCode });

async function loadJourney(connection, studentId, settings) {
  const [[student]] = await connection.query(
    'SELECT points AS rankingPoints FROM students WHERE id = ? LIMIT 1',
    [studentId],
  );
  if (!student) throw fail('الطالب غير موجود.', 404);
  const [rewards] = await connection.query(
    `SELECT stage_points AS stagePoints, best_reward AS bestReward,
      attempts_count AS attemptsCount, completed_at AS completedAt
     FROM student_summit_stage_rewards WHERE student_id = ?`,
    [studentId],
  );
  const rewardByStage = new Map(rewards.map((row) => [Number(row.stagePoints), row]));
  const mapConfig = normalizeSummitMapConfig(settings.summitMapConfig);
  const configuredActiveStation = getSummitActiveStation(mapConfig);
  const activeStationReward = configuredActiveStation
    ? rewardByStage.get(Number(configuredActiveStation.kilometer))
    : null;
  const activeStation = configuredActiveStation && !activeStationReward?.completedAt
    ? configuredActiveStation
    : null;
  const totalKilometers = getSummitMapTotalKilometers(mapConfig);
  const configuredStages = getSummitMapEventLocations(mapConfig).map((location) => ({
    ...location,
    key: location.id,
    points: location.kilometer,
    duration: 45,
    challenge: location.challengeEnabled ? getSummitChallengeTitle(location.challengeType) : '',
  }));
  const stagesWithGoal = mapConfig.goal.enabled ? [...configuredStages, {
    id: 'mystery-goal', key: 'mystery-goal', name: mapConfig.goal.name,
    points: totalKilometers, kilometer: totalKilometers, duration: 0, isGoal: true,
    notificationEnabled: false, challengeEnabled: false, challenge: '',
  }] : configuredStages;
  const progressSummary = getSummitProgressSummary(student.rankingPoints, stagesWithGoal, totalKilometers);
  const summary = {
    ...progressSummary,
    reachedSummit: mapConfig.goal.enabled && progressSummary.reachedSummit,
  };
  const [[progressState]] = await connection.query(
    'SELECT kilometers FROM student_summit_progress WHERE student_id = ? LIMIT 1',
    [studentId],
  );
  const storedDisplayedKilometers = progressState
    ? Math.min(totalKilometers, Math.max(0, Number(progressState.kilometers || 0)))
    : summary.points;
  if (!progressState) {
    await connection.query(
      'INSERT IGNORE INTO student_summit_progress (student_id, kilometers) VALUES (?, ?)',
      [studentId, storedDisplayedKilometers],
    );
  }
  return {
    ...summary,
    totalKilometers,
    displayedKilometers: activeStation ? Number(activeStation.kilometer) : storedDisplayedKilometers,
    activeStation,
    enabled: Boolean(settings.summitEnabled),
    challengeMaxPoints: Math.max(0, Number(settings.summitChallengeMaxPoints || 50)),
    mapConfig,
    stages: stagesWithGoal.map((stage) => {
      const reward = rewardByStage.get(stage.points);
      return {
        ...stage,
        unlocked: summary.points >= stage.points,
        completed: stage.isGoal
          ? summary.reachedSummit
          : Boolean(reward?.completedAt),
        bestReward: Number(reward?.bestReward || 0),
        attemptsCount: Number(reward?.attemptsCount || 0),
      };
    }),
  };
}

export function createSummitRouter({
  loadSettings,
  applyStudentPointDelta,
  logStudentPointTransaction,
  getToday,
}) {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      if (req.auth?.role !== 'student') return res.status(403).json({ message: 'رحلة القمّة متاحة للطلاب فقط.' });
      const settings = await loadSettings();
      if (!settings.summitEnabled) return res.status(404).json({ message: 'رحلة القمّة غير مفعّلة.' });
      return res.json(await loadJourney(db(), req.auth.id, settings));
    } catch (error) { return next(error); }
  });

  router.put('/progress', async (req, res, next) => {
    try {
      if (req.auth?.role !== 'student') return res.status(403).json({ message: 'رحلة القمّة متاحة للطلاب فقط.' });
      const requested = Math.max(0, Math.trunc(Number(req.body?.kilometers) || 0));
      const settings = await loadSettings();
      const totalKilometers = getSummitMapTotalKilometers(settings.summitMapConfig);
      const [[student]] = await db().query('SELECT points FROM students WHERE id = ? LIMIT 1', [req.auth.id]);
      if (!student) throw fail('الطالب غير موجود.', 404);
      const kilometers = Math.min(totalKilometers, Number(student.points || 0), requested);
      await db().query(
        `INSERT INTO student_summit_progress (student_id, kilometers, reached_summit_at)
         VALUES (?, ?, IF(? >= ?, NOW(), NULL))
         ON DUPLICATE KEY UPDATE kilometers = VALUES(kilometers),
           reached_summit_at = IF(VALUES(kilometers) >= ?, COALESCE(reached_summit_at, NOW()), reached_summit_at)`,
        [req.auth.id, kilometers, kilometers, totalKilometers, totalKilometers],
      );
      return res.json({ kilometers });
    } catch (error) { return next(error); }
  });

  router.post('/stages/:points/acknowledge', async (req, res, next) => {
    try {
      if (req.auth?.role !== 'student') return res.status(403).json({ message: 'رحلة القمّة متاحة للطلاب فقط.' });
      const settings = await loadSettings();
      const stage = getSummitMapEventLocation(settings.summitMapConfig, req.params.points);
      if (
        !stage
        || stage.challengeEnabled
        || (!['station', 'city'].includes(stage.locationType) && !stage.notificationEnabled)
      ) {
        throw fail('لا يوجد إشعار مستقل في هذا الموقع.');
      }
      const [[student]] = await db().query('SELECT points FROM students WHERE id = ? LIMIT 1', [req.auth.id]);
      const activeStation = getSummitActiveStation(settings.summitMapConfig);
      const forcedStation = activeStation?.id === stage.id;
      if (!student || (!forcedStation && Number(student.points || 0) < Number(stage.kilometer))) {
        throw fail('لم تصل إلى هذا الموقع بعد.', 403);
      }
      await db().query(
        `INSERT INTO student_summit_stage_rewards
          (student_id, stage_points, best_reward, attempts_count, completed_at)
         VALUES (?, ?, 0, 0, NOW())
         ON DUPLICATE KEY UPDATE completed_at = COALESCE(completed_at, NOW())`,
        [req.auth.id, stage.kilometer],
      );
      return res.json({ ok: true });
    } catch (error) { return next(error); }
  });

  router.post('/stages/:points/start', async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      if (req.auth?.role !== 'student') return res.status(403).json({ message: 'رحلة القمّة متاحة للطلاب فقط.' });
      const settings = await loadSettings();
      if (!settings.summitEnabled) throw fail('رحلة القمّة غير مفعّلة.', 404);
      const station = getSummitMapEventLocation(settings.summitMapConfig, req.params.points);
      if (!station?.challengeEnabled) throw fail('لا يوجد تحدٍ مفعّل في هذا الموقع.');
      const stage = {
        ...station,
        key: station.id,
        points: station.kilometer,
        duration: 45,
      };
      await connection.beginTransaction();
      const [[student]] = await connection.query(
        'SELECT points AS rankingPoints FROM students WHERE id = ? FOR UPDATE',
        [req.auth.id],
      );
      const activeStation = getSummitActiveStation(settings.summitMapConfig);
      const forcedStation = activeStation?.id === station.id;
      if (!student || (!forcedStation && Number(student.rankingPoints) < stage.points)) throw fail('لم تصل إلى هذه المرحلة بعد.', 403);
      const gameType = normalizeSummitChallengeType(station.challengeType);
      const challenge = gameType ? createDailyChallenge(gameType) : null;
      if (!challenge) throw fail('تعذر تجهيز تحدي هذا الموقع. راجع إعداد نوع التحدي.', 409);
      const attemptStage = { ...stage, challenge: getSummitChallengeTitle(gameType) };
      const [result] = await connection.query(
        'INSERT INTO student_summit_attempts (student_id, stage_points, challenge_json) VALUES (?, ?, ?)',
        [req.auth.id, stage.points, JSON.stringify({ gameType, challenge })],
      );
      await connection.commit();
      const publicAttempt = sanitizeDailyChallenge({
        id: result.insertId,
        challengeDate: getToday(),
        gameType,
        status: 'started',
        challenge,
      });
      return res.json({
        attemptId: result.insertId,
        stage: attemptStage,
        gameType,
        challenge: publicAttempt.challenge,
      });
    } catch (error) { await connection.rollback(); return next(error); } finally { connection.release(); }
  });

  router.post('/attempts/:attemptId/submit', async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      if (req.auth?.role !== 'student') return res.status(403).json({ message: 'رحلة القمّة متاحة للطلاب فقط.' });
      const settings = await loadSettings();
      await connection.beginTransaction();
      const [[attempt]] = await connection.query(
        `SELECT id, stage_points AS stagePoints, challenge_json AS challengeJson, status,
          GREATEST(1, TIMESTAMPDIFF(SECOND, started_at, NOW())) AS elapsedSeconds
         FROM student_summit_attempts WHERE id = ? AND student_id = ? FOR UPDATE`,
        [req.params.attemptId, req.auth.id],
      );
      if (!attempt) throw fail('محاولة التحدي غير موجودة.', 404);
      if (attempt.status !== 'started') throw fail('سبق إنهاء هذه المحاولة.', 409);
      const station = getSummitMapEventLocation(settings.summitMapConfig, attempt.stagePoints);
      if (!station?.challengeEnabled) throw fail('تم تعطيل تحدي هذا الموقع.', 409);
      const stage = { ...station, points: station.kilometer, duration: 45 };
      const storedChallenge = JSON.parse(attempt.challengeJson);
      const challenge = storedChallenge.challenge || storedChallenge;
      const gameType = storedChallenge.gameType
        || normalizeSummitChallengeType(challenge.type);
      const score = SUMMIT_DAILY_CHALLENGE_GAME_TYPES.includes(gameType)
        ? scoreSummitChallenge(challenge, req.body, attempt.elapsedSeconds, stage.duration)
        : (() => {
            const completed = isDailyChallengeCorrect(gameType, challenge, req.body);
            return { completed, accuracy: completed ? 1 : 0, errors: completed ? 0 : 1, reward: completed ? 50 : 0 };
          })();
      let awardedPoints = 0;
      const [[previousReward]] = await connection.query(
        'SELECT best_reward AS bestReward FROM student_summit_stage_rewards WHERE student_id = ? AND stage_points = ? FOR UPDATE',
        [req.auth.id, stage.points],
      );
      awardedPoints = await saveSummitAttemptReward({ score, previousReward, station, settings, awardedPoints, applyStudentPointDelta, connection, req, getToday, logStudentPointTransaction, stage, attempt });
      await connection.query(
        `UPDATE student_summit_attempts SET status = ?, accuracy = ?, errors_count = ?,
          reward_points = ?, completed_at = NOW() WHERE id = ?`,
        [score.completed ? 'completed' : 'failed', score.accuracy, score.errors, awardedPoints, attempt.id],
      );
      await connection.commit();
      return res.json({ ...score, awardedPoints });
    } catch (error) { await connection.rollback(); return next(error); } finally { connection.release(); }
  });

  return router;
}

/** Award only an improvement over the locked best reward and preserve attempt counts. */
async function saveSummitAttemptReward({ score, previousReward, station, settings, awardedPoints, applyStudentPointDelta, connection, req, getToday, logStudentPointTransaction, stage, attempt }) {
  if (score.completed) {
    const previousBest = Number(previousReward?.bestReward || 0);
    const maximumPoints = Math.max(0, Number(station.rewardPoints ?? settings.summitChallengeMaxPoints ?? 50));
    const calculatedPoints = Math.round((score.reward / 50) * maximumPoints);
    const improvement = Math.max(0, calculatedPoints - previousBest);
    const storedBest = settings.pointsSystemEnabled ? calculatedPoints : previousBest;
    if (settings.pointsSystemEnabled && improvement > 0) {
      awardedPoints = await applyStudentPointDelta(connection, req.auth.id, improvement, settings, { date: getToday() });
      if (awardedPoints > 0) {
        await logStudentPointTransaction(connection, {
          studentId: req.auth.id,
          actorRole: 'student',
          actorName: req.auth.name || 'الطالب',
          type: 'increase',
          points: awardedPoints,
          reason: `إكمال تحدي المسار: ${stage.name}`,
          date: getToday(),
          sourceType: 'summit_challenge',
          sourceId: attempt.id,
          dedupeKey: `summit_challenge:${attempt.id}`,
        });
      }
    }
    await connection.query(
      `INSERT INTO student_summit_stage_rewards
            (student_id, stage_points, best_reward, attempts_count, completed_at)
           VALUES (?, ?, ?, 1, NOW())
           ON DUPLICATE KEY UPDATE best_reward = GREATEST(best_reward, VALUES(best_reward)),
             attempts_count = attempts_count + 1, completed_at = COALESCE(completed_at, NOW())`,
      [req.auth.id, stage.points, storedBest]
    );
  } else {
    await connection.query(
      `INSERT INTO student_summit_stage_rewards (student_id, stage_points, attempts_count)
           VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE attempts_count = attempts_count + 1`,
      [req.auth.id, stage.points]
    );
  }
  return awardedPoints;
}
