import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

test('a partially accepted Nazem batch can replay its own recorded part without reopening another evaluation', () => {
  const source = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  const definition = source.match(/const nazemEvaluationOpenFilter = `[\s\S]*?`;/)?.[0];
  assert.ok(definition);
  const filter = new Function(`${definition} return nazemEvaluationOpenFilter;`)();
  const database = new DatabaseSync(':memory:');
  try {
    database.function('IF', (condition, yes, no) => condition ? yes : no);
    database.function('JSON_UNQUOTE', value => value);
    database.exec(`
      CREATE TABLE student_quran_tasks(id INTEGER,plan_id INTEGER,student_id INTEGER,task_date TEXT,task_type TEXT,track TEXT);
      CREATE TABLE student_quran_recitation_attempts(task_id INTEGER,evaluator_id INTEGER,request_id TEXT,
        session_date TEXT,is_official INTEGER,teacher_completed INTEGER);
      CREATE TABLE nazem_plan_links(ruwasi_plan_id INTEGER,ruwasi_student_id INTEGER,teacher_id INTEGER,sync_status TEXT);
      CREATE TABLE nazem_accounts(teacher_id INTEGER,status TEXT);
      CREATE TABLE app_settings(setting_key TEXT,setting_value TEXT);
      CREATE TABLE nazem_daily_follow_up_links(ruwasi_plan_id INTEGER,ruwasi_student_id INTEGER,
        follow_up_date TEXT,track TEXT,task_type TEXT,remote_snapshot TEXT);
      INSERT INTO student_quran_tasks VALUES(1,2,3,'2026-10-05','link','memorization');
      INSERT INTO nazem_plan_links VALUES(2,3,14,'synced');
      INSERT INTO nazem_accounts VALUES(14,'connected');
      INSERT INTO app_settings VALUES('nazemIntegrationEnabled','true');
      INSERT INTO student_quran_recitation_attempts VALUES(1,14,'session:1','2026-10-05',1,1);
    `);
    const query = database.prepare(`SELECT t.id FROM student_quran_tasks t WHERE ${filter}`);
    assert.deepEqual(query.all(14, 'session:1', '2026-10-05').map(row => row.id), [1]);
    assert.deepEqual(query.all(15, 'session:1', '2026-10-05'), []);
    assert.deepEqual(query.all(14, 'another-session:1', '2026-10-05'), []);
    assert.deepEqual(query.all(14, 'session:1', '2026-10-04'), []);
    database.exec(`UPDATE student_quran_recitation_attempts SET is_official=0;
      INSERT INTO student_quran_recitation_attempts VALUES(1,14,'replacement:1','2026-10-05',1,1)`);
    assert.deepEqual(query.all(14, 'session:1', '2026-10-05'), []);
  } finally { database.close(); }
});
