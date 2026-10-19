// Own the native connection for its entire initialization, including schema upgrades.
// A WebView reload can leave the native connection alive after its JS owner is gone.
export function createEncryptedSqliteDatabaseOpener({ sqlite, native, createSecret }) {
  const databases = new Map();
  let encryptionReady;
  const prepareEncryption = () => {
    if (!encryptionReady) {
      encryptionReady = (async () => {
        const stored = await sqlite.isSecretStored();
        if (!stored.result) await sqlite.setEncryptionSecret(createSecret());
      })().catch(error => { encryptionReady = null; throw error; });
    }
    return encryptionReady;
  };
  return function openDatabase(database, version, initialize) {
    if (databases.has(database)) return databases.get(database);
    const pending = (async () => {
      await prepareEncryption();
      let connection;
      try {
        if ((await sqlite.isConnection(database, false)).result) {
          connection = await sqlite.retrieveConnection(database, false);
        } else {
          try {
            connection = await sqlite.createConnection(database, true, 'secret', version, false);
          } catch (error) {
            if (!/connection .+ already exists/i.test(String(error?.message || error))) throw error;
            // Close only this orphaned connection; never delete its database or other stores.
            await native.closeConnection({ database, readonly: false });
            connection = await sqlite.createConnection(database, true, 'secret', version, false);
          }
        }
        if (!(await connection.isDBOpen()).result) await connection.open();
        await initialize(connection);
        return connection;
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        if (connection) {
          try { await sqlite.closeConnection(database, false); }
          catch (cleanupError) { error.cleanupError = cleanupError; }
        }
        throw error;
      }
    })().catch(error => { databases.delete(database); throw error; });
    databases.set(database, pending);
    return pending;
  };
}
