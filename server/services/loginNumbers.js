export function normalizeThreeDigitLoginNumber(value) {
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  return /^\d{3}$/.test(digits) ? digits : '';
}

export async function loadUsedLoginNumbers(connection) {
  const [rows] = await connection.query(`
    SELECT login_number AS loginNumber FROM students
    UNION
    SELECT login_number AS loginNumber FROM supervisors
  `);
  return new Set(rows.map((row) => String(row.loginNumber || '').trim()).filter(Boolean));
}

export function generateThreeDigitLoginNumber(usedLoginNumbers) {
  for (let attempt = 0; attempt < 1200; attempt += 1) {
    const value = String(Math.floor(100 + Math.random() * 900));
    if (!usedLoginNumbers.has(value)) {
      usedLoginNumbers.add(value);
      return value;
    }
  }

  for (let number = 100; number <= 999; number += 1) {
    const value = String(number);
    if (!usedLoginNumbers.has(value)) {
      usedLoginNumbers.add(value);
      return value;
    }
  }

  return '';
}
