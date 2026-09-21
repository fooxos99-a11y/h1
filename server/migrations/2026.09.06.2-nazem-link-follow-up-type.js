export const version = '2026.09.06.2';

async function readConstraint(connection) {
  const [[constraint]] = await connection.query(
    `SELECT CHECK_CLAUSE AS clause FROM information_schema.check_constraints
     WHERE constraint_schema = DATABASE() AND constraint_name = 'nazem_daily_follow_up_type_check'`,
  );
  return constraint;
}

async function replaceConstraint(connection, existing, allowLink) {
  await connection.query(`ALTER TABLE nazem_daily_follow_up_links
    ${existing ? 'DROP CHECK nazem_daily_follow_up_type_check,' : ''}
    ADD CONSTRAINT nazem_daily_follow_up_type_check
      CHECK (task_type IN ('memorization','review'${allowLink ? ",'link'" : ''}))`);
}

export async function up(connection) {
  const existing = await readConstraint(connection);
  if (existing && /'link'/i.test(existing.clause.replaceAll("\\'", "'"))) return;
  // Replace the constraint atomically, without leaving a period of unchecked writes.
  await replaceConstraint(connection, existing, true);
}

export async function down(connection) {
  const [[unsupported]] = await connection.query(
    "SELECT COUNT(*) AS count FROM nazem_daily_follow_up_links WHERE task_type NOT IN ('memorization','review')",
  );
  if (Number(unsupported.count)) {
    throw new Error('Cannot roll back while link follow-ups exist. Keep the expanded constraint to preserve recitation data.');
  }
  await replaceConstraint(connection, await readConstraint(connection), false);
}
