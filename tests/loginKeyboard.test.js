import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('login provides a submit-capable keyboard and submits Enter through form validation', async () => {
  const source = await readFile(new URL('../src/components/public/AccountLoginForm.jsx', import.meta.url), 'utf8');
  assert.match(source, /type="text"/);
  assert.match(source, /inputMode="text"/);
  assert.match(source, /enterKeyHint="done"/);
  assert.match(source, /event\.key === 'Enter' && !event\.nativeEvent\.isComposing/);
  assert.match(source, /event\.preventDefault\(\);\s*if \(!event\.repeat\) event\.currentTarget\.form\?\.requestSubmit\(\)/);
  assert.match(source, /!loading && loginNumber\.trim\(\)/);
  assert.doesNotMatch(source, /onBlur=/);
});
