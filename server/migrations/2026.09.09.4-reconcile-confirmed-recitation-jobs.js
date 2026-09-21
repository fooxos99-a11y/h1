import { reconcileConfirmedRecitationJobs } from '../integrations/nazem/confirmedRecitationJobs.js';

export const version = '2026.09.09.4';

export async function up(connection) {
  await reconcileConfirmedRecitationJobs(connection);
}
