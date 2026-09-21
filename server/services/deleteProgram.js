export async function deleteProgram(connection, programId) {
  const id = Number(programId);
  if (!Number.isSafeInteger(id) || id <= 0) throw Object.assign(new Error('معرّف البرنامج غير صالح.'), { statusCode: 422 });
  const [[program]] = await connection.query('SELECT id FROM learning_paths WHERE id = ? FOR UPDATE', [id]);
  if (!program) throw Object.assign(new Error('البرنامج غير موجود.'), { statusCode: 404 });
  // Delete children first for the parent FK. Earned balances and the point ledger are independent.
  await connection.query('DELETE FROM learning_paths WHERE parent_path_id = ?', [id]);
  await connection.query('DELETE FROM learning_paths WHERE id = ?', [id]);
}
