import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { normalizeOptionalAccountNumber } from '../shared/account-contact.js';

test('identity and phone accept empty or non-ten-digit values for every account type', async () => {
  assert.equal(normalizeOptionalAccountNumber(''), '');
  assert.equal(normalizeOptionalAccountNumber('123'), '123');
  assert.equal(normalizeOptionalAccountNumber('٠٥ ١٢٣'), '05123');
  assert.throws(() => normalizeOptionalAccountNumber('1'.repeat(41)), /40/);

  const [server, registration, students, requests] = await Promise.all([
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/PublicRegistration.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/StudentsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/RegistrationRequestsSection.jsx', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(server, /رقم (?:الجوال|الهوية) يجب أن يكون 10 أرقام/);
  assert.doesNotMatch(registration, /maxLength=\{10\}|guardianPhone[^\n]+required|nationalId[^\n]+required/);
  assert.doesNotMatch(requests, /acceptForm\.(?:guardianPhone|nationalId)\.trim\(\)/);
  assert.doesNotMatch(students, /!String\(student\.(?:guardianPhone|nationalId)\)\.trim\(\)/);
});
