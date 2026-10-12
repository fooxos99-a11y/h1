import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

export function safePreflightFailure(phase, error) {
  const codes = new Set(['PENDING_MIGRATIONS', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR', 'ECONNREFUSED', 'ETIMEDOUT']);
  return { event: 'WEB_PREFLIGHT_FAILED', phase, code: codes.has(error?.code) ? error.code : 'CHECK_FAILED' };
}

async function checkRelease(release, configPath) {
  let phase = 'configuration';
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!Array.isArray(config.databases) || !config.databases.length) throw new Error('Missing database configuration');
    phase = 'dependencies';
    const { default: dotenv } = await import(pathToFileURL(`${release}/node_modules/dotenv/lib/main.js`));
    const { default: mysql } = await import(pathToFileURL(`${release}/node_modules/mysql2/promise.js`));
    const { loadDatabaseMigrations } = await import(pathToFileURL(`${release}/server/databaseMigrations.js`));
    const env = dotenv.parse(fs.readFileSync(`${release}/.env`));
    phase = 'migrations';
    const migrations = await loadDatabaseMigrations();
    phase = 'database';
    for (const database of config.databases) {
      const connection = await mysql.createConnection({ host: env.MYSQL_HOST, port: Number(env.MYSQL_PORT || 3306), user: env.MYSQL_USER, password: env.MYSQL_PASSWORD, database });
      try {
        const [tables] = await connection.query("SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='schema_migrations'");
        if (!tables.length) continue;
        const [rows] = await connection.query('SELECT version FROM schema_migrations');
        const applied = new Set(rows.map(row => row.version));
        if (migrations.some(migration => !applied.has(migration.version))) {
          const error = new Error('Database migration requires a separate reviewed deployment');
          error.code = 'PENDING_MIGRATIONS';
          throw error;
        }
      } finally { await connection.end(); }
    }
  } catch (error) {
    // Never print database credentials, paths, queries or raw dependency errors.
    process.stdout.write(`${JSON.stringify(safePreflightFailure(phase, error))}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await checkRelease(...process.argv.slice(2));
}
