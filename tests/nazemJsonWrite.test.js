import test from 'node:test';
import assert from 'node:assert/strict';
import { NazemAdapter } from '../server/integrations/nazem/adapter.js';
import { nazemErrorDiagnostics } from '../server/integrations/nazem/errorDiagnostics.js';

test('Nazem writes request JSON errors and never follow a redirect as a successful save', async () => {
  const adapter = new NazemAdapter();
  adapter.followUpApiBase = 'https://api.nazem-plus.com/api';
  adapter.followUpApiHeaders = { accept: 'text/html', 'x-company-id': '1' };
  adapter.context = { request: { post: async (_url, options) => {
    assert.equal(options.headers.accept, 'application/json');
    assert.equal(options.headers['x-company-id'], '1');
    assert.equal(options.maxRedirects, 0);
    return { ok: () => false, status: () => 422, json: async () => ({ message: 'Invalid supplied amount', errors: { actual_end_aya: ['Outside the scheduled amount'] } }) };
  } } };
  await assert.rejects(adapter.postFollowUpApi('/educational-plans/item-days/1/partial', {}), error => {
    assert.equal(error.code, 'NAZEM_FOLLOW_UP_SAVE_REJECTED');
    assert.equal(nazemErrorDiagnostics(error).httpStatus, 422);
    assert.match(error.cause.message, /actual_end_aya/);
    return true;
  });
});
