import { URL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'whatsapp-web.js') {
    return { url: new URL('./whatsappSyntheticClient.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
