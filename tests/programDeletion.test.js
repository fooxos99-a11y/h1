import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteProgram } from '../server/services/deleteProgram.js';

test('deleting a program removes its completed sections first and preserves independent points', async () => {
  const paths = [{ id: 1 }, { id: 2, parent: 1 }, { id: 3, parent: 1 }, { id: 4 }];
  const student = { points: 120, storeBalance: 80 };
  const ledger = [{ sourceId: 2, points: 40 }, { sourceId: 3, points: 80 }];
  const connection = { query: async (sql, [id]) => {
    if (sql.startsWith('SELECT')) return [[paths.find(path => path.id === id)].filter(Boolean)];
    if (sql === 'DELETE FROM learning_paths WHERE parent_path_id = ?') {
      for (let i = paths.length - 1; i >= 0; i -= 1) if (paths[i].parent === id) paths.splice(i, 1);
    } else if (sql === 'DELETE FROM learning_paths WHERE id = ?') {
      assert.ok(!paths.some(path => path.parent === id), 'parent FK requires deleting sections first');
      paths.splice(paths.findIndex(path => path.id === id), 1);
    } else throw new Error(`Unexpected points mutation: ${sql}`);
    return [{ affectedRows: 1 }];
  } };
  await deleteProgram(connection, 1);
  assert.deepEqual(paths, [{ id: 4 }]);
  assert.deepEqual(student, { points: 120, storeBalance: 80 });
  assert.deepEqual(ledger, [{ sourceId: 2, points: 40 }, { sourceId: 3, points: 80 }]);
  await assert.rejects(deleteProgram(connection, 1), { statusCode: 404 });
  await assert.rejects(deleteProgram(connection, '1 OR 1'), { statusCode: 422 });
});
