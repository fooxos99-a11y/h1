const fail = message => Object.assign(new Error(message), { statusCode: 422 });

export async function saveProgramSections(connection, parentId, sections, replaceChildren) {
  const [existing] = await connection.query('SELECT id FROM learning_paths WHERE parent_path_id = ? FOR UPDATE', [parentId]);
  const owned = new Set(existing.map(row => Number(row.id)));
  const retained = new Set();
  for (const [index, section] of sections.entries()) {
    let id = Number(section.id || 0);
    if (section.id != null && (!Number.isSafeInteger(id) || id <= 0)) throw fail('معرّف القسم غير صالح.');
    if (id) {
      if (!owned.has(id) || retained.has(id)) throw fail('القسم غير صالح لهذا البرنامج.');
      await connection.query('UPDATE learning_paths SET title = ?, status = ?, points_reward = ?, allow_multiple_attempts = 0, sort_order = ? WHERE id = ? AND parent_path_id = ?',
        [section.title, section.status, section.pointsReward, index, id, parentId]);
    } else {
      const [created] = await connection.query('INSERT INTO learning_paths (title, status, points_reward, allow_multiple_attempts, sort_order, parent_path_id) VALUES (?, ?, ?, 0, ?, ?)',
        [section.title, section.status, section.pointsReward, index, parentId]);
      id = Number(created.insertId);
    }
    retained.add(id);
    await replaceChildren(connection, id, section);
  }
  for (const id of owned) {
    if (retained.has(id)) continue;
    const [progress] = await connection.query('SELECT student_id FROM student_path_progress WHERE path_id = ? LIMIT 1', [id]);
    if (progress.length) throw fail('لا يمكن حذف قسم له نتائج؛ أخفه للحفاظ على نقاط الطلاب.');
    await connection.query('DELETE FROM learning_paths WHERE id = ? AND parent_path_id = ?', [id, parentId]);
  }
}
