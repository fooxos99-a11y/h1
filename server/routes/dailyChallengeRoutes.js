import express from 'express';
import { db } from '../db.js';
import {
  getDailyChallengeWeekDay,
  getDailyChallengeGame,
} from '../../shared/daily-challenge.js';
import {
  createDailyChallenge,
  getDailyChallengeGameLabel,
  isDailyChallengeCorrect,
  sanitizeDailyChallenge,
} from '../../shared/daily-challenge-engine.js';
import { isUuid } from '../../shared/offline-recitation.js';

const fail = (message, statusCode = 422) => Object.assign(new Error(message), { statusCode });
const isDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
const daysBetween = (from, to) => Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

async function loadAttempt(connection, studentId, date, lock = false) {
  const [[row]] = await connection.query(
    `SELECT id, challenge_date AS challengeDate, game_type AS gameType, challenge_json AS challengeJson,
      status, points_awarded AS pointsAwarded, submit_request_id AS submitRequestId
     FROM daily_challenge_attempts
     WHERE student_id = ? AND challenge_date = ?${lock ? ' FOR UPDATE' : ''}`,
    [studentId, date]
  );
  return row || null;
}

export function createDailyChallengeRouter({ loadSettings, applyStudentPointDelta, logStudentPointTransaction, getToday }) {
  const router = express.Router();
  router.use((req, res, next) => req.auth?.role === 'student'
    ? next()
    : res.status(403).json({ message: 'التحدي اليومي متاح للطلاب فقط.' }));
  router.use(async (req, res, next) => {
    try {
      const settings = await loadSettings();
      if (!settings.dailyChallengeEnabled) return res.status(404).json({ message: 'التحدي اليومي غير مفعّل.' });
      const today = getToday();
      const requestedDate = req.method === 'POST' && req.path === '/submit'
        ? String(req.body.challengeDate || today)
        : today;
      if (!isDateOnly(requestedDate) || daysBetween(requestedDate, today) < 0 || daysBetween(requestedDate, today) > 14) {
        return res.status(422).json({ message: 'تاريخ التحدي غير صالح للمزامنة.' });
      }
      const date = requestedDate;
      if (!settings.dailyChallengeDays.includes(getDailyChallengeWeekDay(date))) {
        return res.status(404).json({ message: 'لا يوجد تحدٍ يومي في هذا اليوم.' });
      }
      req.dailyChallengeSettings = settings;
      req.dailyChallengeDate = date;
      return next();
    } catch (error) { return next(error); }
  });

  router.get('/', async (req, res, next) => {
    try {
      const settings = req.dailyChallengeSettings;
      const date = req.dailyChallengeDate || getToday();
      const attempt = await loadAttempt(db(), req.auth.id, date);
      const gameType = attempt?.gameType || null;
      res.json({
        date,
        gameType,
        gameLabel: gameType ? getDailyChallengeGameLabel(gameType) : 'لعبة عشوائية',
        points: settings.pointsSystemEnabled ? Number(settings.dailyChallengePoints || 0) : 0,
        attempt: sanitizeDailyChallenge(attempt),
      });
    } catch (error) { next(error); }
  });

  router.post('/start', async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      const settings = req.dailyChallengeSettings;
      const date = req.dailyChallengeDate || getToday();
      await connection.beginTransaction();
      let attempt = await loadAttempt(connection, req.auth.id, date, true);
      if (!attempt) {
        const gameType = getDailyChallengeGame(date, settings.dailyChallengeGames);
        const challenge = createDailyChallenge(gameType);
        const [result] = await connection.query(
          'INSERT INTO daily_challenge_attempts (student_id, challenge_date, game_type, challenge_json) VALUES (?, ?, ?, ?)',
          [req.auth.id, date, gameType, JSON.stringify(challenge)]
        );
        attempt = { id: result.insertId, challengeDate: date, gameType, challengeJson: JSON.stringify(challenge), status: 'started', pointsAwarded: 0 };
      }
      await connection.commit();
      res.json({ attempt: sanitizeDailyChallenge(attempt) });
    } catch (error) { await connection.rollback(); next(error); } finally { connection.release(); }
  });

  router.post('/submit', async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      const settings = req.dailyChallengeSettings;
      const date = req.dailyChallengeDate || getToday();
      const requestId = isUuid(req.body.requestId) ? String(req.body.requestId).toLowerCase() : null;
      await connection.beginTransaction();
      const attempt = await loadAttempt(connection, req.auth.id, date, true);
      if (!attempt) throw fail('ابدأ التحدي أولاً.', 404);
      if (attempt.status !== 'started') {
        if (requestId && attempt.submitRequestId === requestId) {
          await connection.commit();
          return res.json({
            correct: attempt.status === 'completed',
            awardedPoints: Number(attempt.pointsAwarded || 0),
            status: attempt.status,
            alreadySynced: true,
          });
        }
        throw fail('سبق إنهاء تحدي اليوم.', 409);
      }
      const challenge = JSON.parse(attempt.challengeJson);
      const correct = isDailyChallengeCorrect(attempt.gameType, challenge, req.body);
      let awardedPoints = 0;
      if (correct && settings.pointsSystemEnabled && Number(settings.dailyChallengePoints) > 0) {
        awardedPoints = await applyStudentPointDelta(connection, req.auth.id, Number(settings.dailyChallengePoints), settings, { date });
        if (awardedPoints > 0) {
          await logStudentPointTransaction(connection, {
            studentId: req.auth.id,
            actorRole: 'student',
            actorName: req.auth.name || 'الطالب',
            type: 'increase',
            points: awardedPoints,
            reason: `إكمال التحدي اليومي: ${getDailyChallengeGameLabel(attempt.gameType)}`,
            date,
            sourceType: 'daily_challenge',
            sourceId: attempt.id,
            dedupeKey: `daily_challenge:${req.auth.id}:${date}`,
          });
        }
      }
      await connection.query(
        "UPDATE daily_challenge_attempts SET status = ?, points_awarded = ?, submit_request_id = ?, completed_at = NOW() WHERE id = ?",
        [correct ? 'completed' : 'failed', awardedPoints, requestId, attempt.id]
      );
      await connection.commit();
      res.json({ correct, awardedPoints, status: correct ? 'completed' : 'failed' });
    } catch (error) { await connection.rollback(); next(error); } finally { connection.release(); }
  });

  return router;
}
