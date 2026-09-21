import '../server/loadEnvironment.js';
import { getNazemRuntimeReadiness, probeNazemPublicLogin } from '../server/integrations/nazem/runtime.js';

const runtime = await getNazemRuntimeReadiness();
const publicLogin = await probeNazemPublicLogin();
const result = { runtime, publicLogin };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!runtime.ready || !publicLogin.ok) process.exitCode = 1;

