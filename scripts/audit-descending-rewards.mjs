import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { auditDescendingRewards } from '../server/services/descendingRewardAudit.js';

// No defaults, environment-file loading, migrations, or writes to the database.
const required = ['RECITATION_AUDIT_HOST', 'RECITATION_AUDIT_DATABASE', 'RECITATION_AUDIT_USER', 'RECITATION_AUDIT_PASSWORD'];
if (required.some(key => !process.env[key])) throw new Error(`Explicit audit connection required: ${required.join(', ')}`);
const connection = await mysql.createConnection({
  host: process.env.RECITATION_AUDIT_HOST,
  database: process.env.RECITATION_AUDIT_DATABASE,
  user: process.env.RECITATION_AUDIT_USER,
  password: process.env.RECITATION_AUDIT_PASSWORD,
  port: Number(process.env.RECITATION_AUDIT_PORT || 3306),
  connectTimeout: 10000,
});
try {
  await connection.query('START TRANSACTION READ ONLY');
  const sql = await readFile(new URL('../docs/descending-reward-audit.sql', import.meta.url), 'utf8');
  const [rows] = await connection.query(sql);
  const candidates = await auditDescendingRewards(rows);
  process.stdout.write(`${JSON.stringify({ readOnly: true, candidates }, null, 2)}\n`);
} finally {
  await connection.rollback();
  await connection.end();
}
