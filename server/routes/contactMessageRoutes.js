import express from 'express';
import { db } from '../db.js';
import { attachOptionalAuthSession } from '../services/authSessions.js';
import { requirePermission } from '../services/dashboardPermissions.js';

const router = express.Router();
const accountRoles = new Set(['student', 'supervisor', 'admin', 'manager']);

const cleanText = (value, maxLength) => String(value || '').trim().slice(0, maxLength);

router.post('/', attachOptionalAuthSession, async (req, res, next) => {
  try {
    const linkedAccount = accountRoles.has(req.auth?.role) && Number(req.auth?.id);
    const senderName = linkedAccount
      ? cleanText(req.auth.name, 180)
      : cleanText(req.body.name, 180);
    const subject = cleanText(req.body.subject, 5000);

    if (senderName.length < 2 || subject.length < 5) {
      return res.status(422).json({ message: 'أدخل الاسم وموضوع الرسالة بشكل واضح.' });
    }

    const [result] = await db().query(
      `INSERT INTO contact_messages
        (sender_role, sender_id, sender_name, subject)
       VALUES (?, ?, ?, ?)`,
      [linkedAccount ? req.auth.role : null, linkedAccount ? req.auth.id : null, senderName, subject],
    );
    return res.status(201).json({ id: result.insertId, linkedAccount: Boolean(linkedAccount) });
  } catch (error) {
    return next(error);
  }
});

router.get('/', requirePermission('contactMessages'), async (_req, res, next) => {
  try {
    const [rows] = await db().query(
      `SELECT
        id,
        sender_role AS senderRole,
        sender_id AS senderId,
        sender_name AS senderName,
        subject,
        status,
        reply,
        replied_by_name AS repliedByName,
        replied_at AS repliedAt,
        created_at AS createdAt
       FROM contact_messages
       ORDER BY created_at DESC, id DESC
       LIMIT 200`,
    );
    return res.json(rows.map((row) => ({
      ...row,
      id: Number(row.id),
      senderId: row.senderId ? Number(row.senderId) : null,
      linkedAccount: Boolean(row.senderRole && row.senderId),
    })));
  } catch (error) {
    return next(error);
  }
});

export default router;
