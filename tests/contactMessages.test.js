import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('public contact messages are account-aware, permission-gated, and read-only in the dashboard', async () => {
  const [
    server,
    route,
    auth,
    database,
    migration,
    permissions,
    clientPermissions,
    api,
    footer,
    dialog,
    dashboard,
    section,
    routes,
  ] = await Promise.all([
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/routes/contactMessageRoutes.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/services/authSessions.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/db.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/migrations/2026.08.27.1-contact-messages.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/services/dashboardPermissions.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/dashboardPermissions.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/studentsApi.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/public/PublicLegalFooter.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/public/PublicContactDialog.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/WajehDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/ContactMessagesSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/sectionRoutes.js', import.meta.url), 'utf8'),
  ]);

  assert.ok(server.includes("['POST', /^\\/contact-messages$/]"));
  assert.match(server, /app\.use\('\/api\/contact-messages', contactMessageRouter\)/);
  assert.match(auth, /attachOptionalAuthSession/);
  assert.match(route, /senderName = linkedAccount[\s\S]*req\.auth\.name/);
  assert.match(route, /requirePermission\('contactMessages'\)/);
  assert.doesNotMatch(route, /createDirectAppNotification|router\.put\('\/:id\/reply'/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS contact_messages/);
  assert.match(migration, /contact_messages/);
  assert.match(permissions, /'contactMessages'/);
  assert.match(clientPermissions, /key: 'contactMessages'.*رسائل التواصل/);
  assert.match(api, /submitContactMessage/);
  assert.doesNotMatch(api, /replyToContactMessage/);
  assert.match(footer, /للتواصل مع المجمع اضغط هنا/);
  assert.match(dialog, /readOnly=\{hasSession\}/);
  assert.match(dialog, /var\(--font-ui\)/);
  assert.match(dashboard, /key: 'contactMessages'.*label: 'التواصل'/);
  assert.match(dashboard, /<ContactMessagesSection/);
  assert.doesNotMatch(section, /إرسال الرد|replyToContactMessage/);
  assert.match(routes, /\['contactMessages', 'contact-messages'\]/);
});

test('Rawasi development preview shows ranking samples without affecting production data', async () => {
  const rankings = await readFile(new URL('../src/components/public/rawasi/RawasiPublicRankings.jsx', import.meta.url), 'utf8');
  assert.match(rankings, /import\.meta\.env\.DEV && rows\.length === 0/);
  assert.match(rankings, /demoStudents/);
  assert.match(rankings, /demoFamilies/);
});
