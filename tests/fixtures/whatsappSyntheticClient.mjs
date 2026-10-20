import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

if (process.env.SYNTHETIC_WHATSAPP !== '1') throw new Error('The synthetic WhatsApp fixture is test-only.');
if (process.env.SYNTHETIC_QR_ONLY === '1') {
  const originalTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, milliseconds, ...arguments_) => originalTimeout(callback, milliseconds >= 120_000 ? 500 : milliseconds, ...arguments_);
}
const base = path.resolve(process.env.SYNTHETIC_ROOT_PATH || '');
const auditFile = path.join(base, 'audit.jsonl');
async function audit(value) {
  await fs.mkdir(base, { recursive: true, mode: 0o700 });
  await fs.appendFile(auditFile, `${JSON.stringify(value)}\n`, { mode: 0o600 });
}

export class LocalAuth { constructor(options) { Object.assign(this, options); } }
export class MessageMedia { constructor(mimetype, data, filename) { Object.assign(this, { mimetype, data, filename }); } }
export class Client extends EventEmitter {
  constructor(options) {
    super();
    const auth = options.authStrategy;
    const authDirectory = path.resolve(auth.dataPath);
    if (!authDirectory.startsWith(`${base}${path.sep}`)) throw new Error('The synthetic auth directory escaped its test root.');
    this.profile = path.join(authDirectory, `session-${auth.clientId}`);
    this.ready = false;
    this.calls = 0;
    this.info = { wid: { user: '00000000000' } };
  }
  async initialize() {
    let reused = true;
    try { await fs.access(path.join(this.profile, 'synthetic-auth-marker')); } catch { reused = false; }
    await fs.mkdir(this.profile, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(this.profile, 'synthetic-auth-marker'), 'synthetic-auth-marker', { mode: 0o600 });
    await audit({ type: 'initialize', reused });
    await setTimeout(10);
    if (process.env.SYNTHETIC_QR_ONLY === '1') { this.emit('qr', 'synthetic-unlinked-qr-only'); return; }
    this.ready = true;
    this.emit('ready');
  }
  async destroy() { this.ready = false; await audit({ type: 'destroy' }); }
  async logout() { await audit({ type: 'logout' }); await fs.rm(this.profile, { recursive: true, force: true }); }
  async getState() { return this.ready ? 'CONNECTED' : 'STARTING'; }
  async isRegisteredUser(phone) { return String(phone).startsWith('000'); }
  async getMessageById(id) { return { id: { _serialized: id }, ack: 2 }; }
  async sendMessage(phone) {
    if (!String(phone).startsWith('000')) throw new Error('A non-synthetic recipient was refused.');
    this.calls += 1;
    await audit({ type: 'send', phone });
    if (process.env.SYNTHETIC_BLOCK_FIRST === '1' && this.calls === 1) await new Promise(() => {});
    const message = { id: { _serialized: `synthetic-${randomUUID()}` }, ack: 2 };
    this.emit('message_ack', message, 2);
    return message;
  }
}
export default { Client, LocalAuth, MessageMedia };
