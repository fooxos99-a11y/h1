import { Capacitor } from '@capacitor/core';
import { getApiBase, getTenantRegistrationNumber } from './apiBase';
import { getBearerToken } from '../lib/authSession';
import { prepareTimedRequest } from '../lib/requestTimeout';
import { resolveAssetUrl } from '../lib/assetUrl';
import { attachmentFileName, attachmentRequestOptions, readAttachmentBlob } from '../lib/programAttachment';
import { saveNativeAttachment, viewNativeAttachment } from './nativeAttachments';

const files = new WeakMap();

export function resolveAttachmentUrl(url) {
  if (Capacitor.isNativePlatform() && url.startsWith('/')) return new URL(url, getApiBase()).href;
  return resolveAssetUrl(url);
}

export function loadProgramAttachment(source) {
  if (!files.has(source)) {
    const load = async () => {
      if (source.blob) return source.blob;
      const url = new URL(source.url, document.baseURI).href;
      const apiUrl = new URL(getApiBase(), document.baseURI).href;
      const options = attachmentRequestOptions(url, apiUrl, { token: await getBearerToken(), registrationNumber: getTenantRegistrationNumber(), native: Capacitor.isNativePlatform() });
      const request = prepareTimedRequest(options, 30_000);
      try { return await readAttachmentBlob({ ...source, url }, request.options); }
      finally { request.cleanup(); }
    };
    files.set(source, load().catch(error => { files.delete(source); throw error; }));
  }
  return files.get(source);
}

export async function downloadProgramAttachment(source, name) {
  const blob = await loadProgramAttachment(source);
  if (Capacitor.isNativePlatform()) return saveNativeAttachment(blob, name);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = attachmentFileName(name, blob.type);
  document.body.append(link); link.click(); link.remove();
  // Revoking the preview URL or closing its dialog must not interrupt the download.
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function viewNativeProgramAttachment(source, name, signal) {
  const blob = await loadProgramAttachment(source);
  if (signal?.aborted) return;
  return viewNativeAttachment(blob, name, { signal });
}
