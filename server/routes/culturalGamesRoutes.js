import crypto from 'node:crypto';
import express from 'express';
import os from 'node:os';

const GAME_TYPES = new Set(['letter-hive', 'categories', 'auction', 'guess-image']);
const SESSION_LIFETIME_HOURS = 12;

const normalizeGameType = (value) => {
  const gameType = String(value || '').trim().toLowerCase();
  return GAME_TYPES.has(gameType) ? gameType : '';
};

const normalizeSessionId = (value) => {
  const id = String(value || '').trim();
  return /^[a-z0-9][a-z0-9_-]{5,79}$/i.test(id) ? id : '';
};

const normalizeQuestionIds = (value) => [...new Set((Array.isArray(value) ? value : [value])
  .map((item) => String(item || '').replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 120))
  .filter(Boolean))];

const hashToken = (token) => crypto.createHash('sha256').update(String(token || '')).digest('hex');

const getLocalNetworkAddress = () => Object.entries(os.networkInterfaces())
  .flatMap(([name, addresses]) => (addresses || []).map((address) => ({ name, ...address })))
  .filter((address) => address.family === 'IPv4' && !address.internal)
  .sort((first, second) => {
    const score = (entry) => (/wi-?fi|wireless|ethernet/i.test(entry.name) ? 2 : 0)
      - (/vethernet|wsl|docker|virtual|vmware|loopback/i.test(entry.name) ? 3 : 0);
    return score(second) - score(first);
  })[0]?.address || '';

const getPresenterOrigin = (req) => {
  const configuredOrigin = String(process.env.PRESENTER_ORIGIN || '').trim().replace(/\/$/, '');
  if (/^https?:\/\//i.test(configuredOrigin)) return configuredOrigin;
  const forwardedHost = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
  const hostname = (forwardedHost.startsWith('[')
    ? forwardedHost.slice(1, forwardedHost.indexOf(']'))
    : forwardedHost.split(':')[0]).toLowerCase();
  if (['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    const localAddress = getLocalNetworkAddress();
    const requestedPort = /^\d{2,5}$/.test(String(req.query.port || '')) ? String(req.query.port) : '';
    const port = requestedPort || forwardedHost.match(/:(\d+)$/)?.[1] || '3000';
    if (localAddress) return `http://${localAddress}:${port}`;
  }
  const protocol = String(req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  return forwardedHost ? `${protocol}://${forwardedHost}` : '';
};

const safeTokenMatch = (token, expectedHash) => {
  const actual = Buffer.from(hashToken(token), 'hex');
  const expected = Buffer.from(String(expectedHash || ''), 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};

const parseState = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') > 750_000) return null;
  return { value, serialized };
};

export function createCulturalGamesRouter({ db, requirePermission }) {
  const router = express.Router();
  const requireAssignedCulturalCompetition = requirePermission('culturalCompetition');
  const requireCulturalCompetition = (req, res, next) => (
    req.auth?.role === 'supervisor'
      ? next()
      : requireAssignedCulturalCompetition(req, res, next)
  );
  const requireBankManagement = (req, res, next) => (
    ['manager', 'admin'].includes(req.auth?.role)
      ? next()
      : res.status(403).json({ message: 'إدارة بنك الأسئلة متاحة للمدير والإداري فقط.' })
  );

  router.get('/presenter-origin', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ origin: getPresenterOrigin(req) });
  });

  router.post('/sessions', requireCulturalCompetition, async (req, res, next) => {
    try {
      const id = normalizeSessionId(req.body.id);
      const gameType = normalizeGameType(req.body.gameType);
      const state = parseState(req.body.state);
      if (!id || !gameType || !state) return res.status(422).json({ message: 'بيانات الجولة غير مكتملة.' });
      const controlToken = crypto.randomBytes(32).toString('base64url');
      await db().query(
        `INSERT INTO cultural_game_sessions
          (id, game_type, state_json, control_token_hash, created_by_role, created_by_id, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
        [id, gameType, state.serialized, hashToken(controlToken), req.auth.role, req.auth.id || null, SESSION_LIFETIME_HOURS],
      );
      res.status(201).json({ id, controlToken });
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'تعذر إنشاء الجولة، حاول مرة أخرى.' });
      return next(error);
    }
  });

  router.get('/sessions/:sessionId', async (req, res, next) => {
    try {
      const id = normalizeSessionId(req.params.sessionId);
      if (!id) return res.status(404).json({ message: 'الجولة غير موجودة.' });
      const [[row]] = await db().query(
        'SELECT game_type AS gameType, state_json AS stateJson FROM cultural_game_sessions WHERE id = ? AND expires_at > NOW() LIMIT 1',
        [id],
      );
      if (!row) return res.status(404).json({ message: 'انتهت الجولة أو لم تعد موجودة.' });
      res.set('Cache-Control', 'no-store');
      return res.json({ id, gameType: row.gameType, state: JSON.parse(row.stateJson || '{}') });
    } catch (error) {
      return next(error);
    }
  });

  router.put('/sessions/:sessionId', async (req, res, next) => {
    try {
      const id = normalizeSessionId(req.params.sessionId);
      const state = parseState(req.body.state);
      const [[session]] = id ? await db().query(
        'SELECT control_token_hash AS controlTokenHash FROM cultural_game_sessions WHERE id = ? AND expires_at > NOW() LIMIT 1',
        [id],
      ) : [[]];
      if (!session) return res.status(404).json({ message: 'انتهت الجولة أو لم تعد موجودة.' });
      if (!state || !safeTokenMatch(req.header('x-game-control-token'), session.controlTokenHash)) {
        return res.status(403).json({ message: 'رابط التحكم بالجولة غير صالح.' });
      }
      await db().query(
        'UPDATE cultural_game_sessions SET state_json = ?, expires_at = DATE_ADD(NOW(), INTERVAL ? HOUR) WHERE id = ?',
        [state.serialized, SESSION_LIFETIME_HOURS, id],
      );
      return res.json({ id, state: state.value });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/question-bank/:gameType', requireCulturalCompetition, async (req, res, next) => {
    try {
      const gameType = normalizeGameType(req.params.gameType);
      if (!gameType) return res.status(422).json({ message: 'نوع المسابقة غير صحيح.' });
      const [[row]] = await db().query(
        'SELECT bank_json AS bankJson FROM cultural_game_question_banks WHERE game_type = ? LIMIT 1',
        [gameType],
      );
      return res.json({ gameType, bank: row ? JSON.parse(row.bankJson) : null });
    } catch (error) {
      return next(error);
    }
  });

  router.put('/question-bank/:gameType', requireCulturalCompetition, requireBankManagement, async (req, res, next) => {
    try {
      const gameType = normalizeGameType(req.params.gameType);
      const bank = parseState(req.body.bank);
      if (!gameType || !bank) return res.status(422).json({ message: 'بنك الأسئلة غير صحيح.' });
      await db().query(
        `INSERT INTO cultural_game_question_banks
          (game_type, bank_json, updated_by_role, updated_by_id)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE bank_json = VALUES(bank_json), updated_by_role = VALUES(updated_by_role),
           updated_by_id = VALUES(updated_by_id), updated_at = CURRENT_TIMESTAMP`,
        [gameType, bank.serialized, req.auth.role, req.auth.id || null],
      );
      return res.json({ gameType, bank: bank.value });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/used-questions/:gameType', requireCulturalCompetition, async (req, res, next) => {
    try {
      const gameType = normalizeGameType(req.params.gameType);
      if (!gameType) return res.status(422).json({ message: 'نوع المسابقة غير صحيح.' });
      const [rows] = await db().query(
        'SELECT question_id AS questionId FROM cultural_game_used_questions WHERE game_type = ? ORDER BY created_at ASC',
        [gameType],
      );
      return res.json({ questionIds: rows.map((row) => row.questionId) });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/used-questions/:gameType/allocate', requireCulturalCompetition, async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      const gameType = normalizeGameType(req.params.gameType);
      const maxPerGroup = Math.max(1, Math.min(10, Number(req.body.maxPerGroup || 1)));
      const groups = (Array.isArray(req.body.groups) ? req.body.groups : []).map((group, index) => ({
        id: String(group.id || index).replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 120),
        questionIds: normalizeQuestionIds(group.questionIds),
      })).filter((group) => group.id && group.questionIds.length);
      if (!gameType || !groups.length) return res.status(422).json({ message: 'مجموعات الأسئلة غير صحيحة.' });

      await connection.beginTransaction();
      const [usedRows] = await connection.query(
        'SELECT question_id AS questionId FROM cultural_game_used_questions WHERE game_type = ? FOR UPDATE',
        [gameType],
      );
      let usedIds = new Set(usedRows.map((row) => row.questionId));
      const candidates = [...new Set(groups.flatMap((group) => group.questionIds))];
      if (candidates.length && candidates.every((id) => usedIds.has(id))) {
        await connection.query('DELETE FROM cultural_game_used_questions WHERE game_type = ?', [gameType]);
        usedIds = new Set();
      }

      const allocated = {};
      const claimed = [];
      groups.forEach((group) => {
        const fresh = group.questionIds.filter((id) => !usedIds.has(id));
        const pool = fresh.length ? fresh : group.questionIds;
        const picked = [...pool].sort(() => Math.random() - 0.5).slice(0, maxPerGroup);
        allocated[group.id] = picked;
        picked.forEach((id) => { usedIds.add(id); claimed.push(id); });
      });
      if (claimed.length) {
        await connection.query(
          'INSERT IGNORE INTO cultural_game_used_questions (game_type, question_id) VALUES ?',
          [claimed.map((id) => [gameType, id])],
        );
      }
      await connection.commit();
      return res.status(201).json({ gameType, allocated });
    } catch (error) {
      await connection.rollback();
      return next(error);
    } finally {
      connection.release();
    }
  });

  router.post('/used-questions/:gameType/claim', requireCulturalCompetition, async (req, res, next) => {
    try {
      const gameType = normalizeGameType(req.params.gameType);
      const questionIds = normalizeQuestionIds(req.body.questionIds);
      if (!gameType || !questionIds.length) return res.status(422).json({ message: 'الأسئلة غير صحيحة.' });
      await db().query(
        'INSERT IGNORE INTO cultural_game_used_questions (game_type, question_id) VALUES ?',
        [questionIds.map((id) => [gameType, id])],
      );
      return res.status(201).json({ gameType, questionIds });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
