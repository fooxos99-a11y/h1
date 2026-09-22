function invalid(message, statusCode = 422) {
  return Object.assign(new Error(message), { statusCode });
}

export function normalizePointAdjustmentTarget(value = 'both') {
  if (!['both', 'balance'].includes(value)) throw invalid('اختر الرصيد فقط أو الرصيد والنقاط الأساسية.');
  return value;
}

// Caller owns the transaction. This ledger never participates in main point totals.
export async function setStudentStoreBalance(connection, { studentId, balance, expectedBalance, reason, actor = {} }) {
  if (!Number.isSafeInteger(balance) || balance < 0 || balance > 2147483647) throw invalid('قيمة الرصيد غير صحيحة.');
  if (!Number.isSafeInteger(expectedBalance)) throw invalid('حدّث بيانات الطالب قبل تعديل الرصيد.');
  const [[student]] = await connection.query('SELECT store_balance AS balance FROM students WHERE id = ? FOR UPDATE', [studentId]);
  if (!student) throw invalid('الطالب غير موجود.', 404);
  const before = Number(student.balance);
  if (before !== expectedBalance) throw invalid('تغير رصيد الطالب. حدّث البيانات ثم أعد التعديل.', 409);
  const delta = balance - before;
  if (!delta) return 0;
  if (!String(reason || '').trim() || reason.length > 500) throw invalid('سبب تعديل الرصيد مطلوب وبحد أقصى 500 حرف.');
  await connection.query('UPDATE students SET store_balance = ? WHERE id = ?', [balance, studentId]);
  await connection.query(`INSERT INTO student_balance_adjustments
    (student_id, delta, balance_before, balance_after, reason, actor_role, actor_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, [studentId, delta, before, balance, reason.trim(), actor.role || null, actor.id || null]);
  return delta;
}
