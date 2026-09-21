import crypto from 'node:crypto';

export const createNazemIdentityFingerprint = (teacherName, organizationName) => crypto
  .createHash('sha256')
  .update(JSON.stringify({
    teacherName: String(teacherName || '').trim(),
    organizationName: String(organizationName || '').trim(),
  }))
  .digest('hex');

