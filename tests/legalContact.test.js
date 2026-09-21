import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('legal pages hide the site name and privacy uses the configured WhatsApp contact', async () => {
  const [layout, terms, privacy, login] = await Promise.all([
    readFile(new URL('../src/components/legal/PublicInfoLayout.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/TermsOfUse.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/PrivacyPolicy.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/LoginGateway.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(layout, /showSiteName &&/);
  assert.match(terms, /showSiteName=\{false\}/);
  assert.match(privacy, /showSiteName=\{false\}/);
  assert.match(privacy, /site\.whatsappUrl \|\| FALLBACK_WHATSAPP_URL/);
  assert.match(privacy, /href=\{whatsappUrl\}/);
  assert.match(privacy, />\s*الرقم\s*<\/a>/);
  assert.match(privacy, /للإستفسارات تواصل مع/);
  assert.match(privacy, /من رابط «طلب حذف الحساب» في تذييل الصفحة الرئيسية/);
  assert.doesNotMatch(privacy, /فتح أيقونة الحساب وتقديم طلب حذف/);
  assert.doesNotMatch(privacy, /عزل بيانات المجمعات|حسابات القاصرين/);
  assert.doesNotMatch(privacy, /to="\/support"|>الدعم<\/Link>/);
  assert.doesNotMatch(login, /WhatsAppIcon|wa\.me\/966539599222/);
});
