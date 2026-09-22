import express from 'express';
import { db } from '../db.js';
import { optimizeStoreProducts } from '../services/storeImages.js';
import { getDailyChallengeWeekDay, pickRandomDailyChallengeGame } from '../../shared/daily-challenge.js';
import {
  createDailyChallenge,
  getDailyChallengeGameLabel,
  sanitizeDailyChallenge,
} from '../../shared/daily-challenge-engine.js';

const mapProduct = (row) => ({
  id: Number(row.id),
  name: row.name,
  imageData: row.imageData,
  pointsPrice: Number(row.pointsPrice || 0),
  stock: row.stock === null ? null : Number(row.stock),
  isActive: Boolean(row.isActive),
});

const addDays = (date, days) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export function createOfflineStudentRouter({ loadSettings, getToday }) {
  const router = express.Router();
  router.use((req, res, next) => req.auth?.role === 'student'
    ? next()
    : res.status(403).json({ message: 'التجهيز المحلي متاح للطلاب فقط.' }));

  router.post('/bootstrap', async (req, res, next) => {
    const connection = await db().getConnection();
    let payload;
    try {
      const settings = await loadSettings();
      const date = getToday();
      await connection.beginTransaction();

      const dailyChallenges = [];
      if (settings.dailyChallengeEnabled) {
        for (let offset = 0; offset <= 14; offset += 1) {
          const challengeDate = addDays(date, offset);
          if (!settings.dailyChallengeDays.includes(getDailyChallengeWeekDay(challengeDate))) continue;
          let [[attempt]] = await connection.query(
            `SELECT id, challenge_date AS challengeDate, game_type AS gameType,
              challenge_json AS challengeJson, status, points_awarded AS pointsAwarded
             FROM daily_challenge_attempts
             WHERE student_id = ? AND challenge_date = ? FOR UPDATE`,
            [req.auth.id, challengeDate],
          );
          if (!attempt) {
            const gameType = pickRandomDailyChallengeGame(settings.dailyChallengeGames);
            const challenge = createDailyChallenge(gameType);
            const [result] = await connection.query(
              `INSERT INTO daily_challenge_attempts
                (student_id, challenge_date, game_type, challenge_json)
               VALUES (?, ?, ?, ?)`,
              [req.auth.id, challengeDate, gameType, JSON.stringify(challenge)],
            );
            attempt = {
              id: result.insertId,
              challengeDate,
              gameType,
              challengeJson: JSON.stringify(challenge),
              status: 'started',
              pointsAwarded: 0,
            };
          }
          dailyChallenges.push({
            date: challengeDate,
            gameType: attempt.gameType,
            gameLabel: getDailyChallengeGameLabel(attempt.gameType),
            points: settings.pointsSystemEnabled ? Number(settings.dailyChallengePoints || 0) : 0,
            attempt: sanitizeDailyChallenge(attempt),
          });
        }
      }
      const dailyChallenge = dailyChallenges.find((item) => item.date === date) || null;

      let store = { enabled: false, products: [], storeBalance: 0, purchasedToday: false };
      if (settings.pointsSystemEnabled && settings.storeEnabled) {
        const [[[student]], [products], [recentOrders]] = await Promise.all([
          connection.query('SELECT store_balance AS storeBalance FROM students WHERE id = ?', [req.auth.id]),
          connection.query(
            `SELECT id, name, image_data AS imageData, points_price AS pointsPrice,
              stock, is_active AS isActive
             FROM store_products
             WHERE deleted_at IS NULL AND is_active = 1 AND (stock IS NULL OR stock > 0)
             ORDER BY created_at DESC, id DESC`,
          ),
          connection.query(
            `SELECT DATE_FORMAT(order_date, '%Y-%m-%d') AS orderDate FROM store_orders
             WHERE student_id = ? AND order_date BETWEEN ? AND ?`,
            [req.auth.id, addDays(date, -14), addDays(date, 14)],
          ),
        ]);
        store = {
          enabled: true,
          products: products.map(mapProduct),
          storeBalance: Number(student?.storeBalance || 0),
          purchasedDates: recentOrders.map((order) => String(order.orderDate)),
          purchasedToday: recentOrders.some((order) => String(order.orderDate) === date),
        };
      }

      await connection.commit();
      payload = {
        date,
        serverTime: new Date().toISOString(),
        cacheDays: 14,
        preparedAt: new Date().toISOString(),
        dailyChallenge,
        dailyChallenges,
        store,
      };
    } catch (error) {
      await connection.rollback();
      return next(error);
    } finally {
      connection.release();
    }
    // Compression must not keep a database connection or transaction occupied.
    payload.store.products = await optimizeStoreProducts(payload.store.products);
    return res.json(payload);
  });

  return router;
}
