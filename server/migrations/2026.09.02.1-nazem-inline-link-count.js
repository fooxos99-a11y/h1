import { createColumnMigration } from '../services/columnMigration.js';

export const version = '2026.09.02.1';
export const { up, down } = createColumnMigration({
  tableName: 'student_quran_tasks',
  columnName: 'actual_link_count',
  addSql: 'ALTER TABLE student_quran_tasks ADD COLUMN actual_link_count INT NULL AFTER actual_listening_count',
  dropSql: 'ALTER TABLE student_quran_tasks DROP COLUMN actual_link_count',
});
