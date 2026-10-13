import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileViewer } from '@capacitor/file-viewer';
import { Share } from '@capacitor/share';
import { attachmentFileName, MAX_ATTACHMENT_BYTES, assertPdfAttachment } from '../lib/programAttachment.js';

const cacheIds = new WeakMap();
const cacheSession = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
let cacheSequence = 0;

async function cacheAttachment(blob, name, filesystem) {
  if (!blob.size || blob.size > MAX_ATTACHMENT_BYTES) throw new Error('تعذر فتح الملف المرفق.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!cacheIds.has(blob)) cacheIds.set(blob, `${cacheSession}-${++cacheSequence}`);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  // Reuse each file's private cache path without requiring WebCrypto in the native WebView.
  const result = await filesystem.writeFile({ path: `program-attachments/${cacheIds.get(blob)}/${attachmentFileName(name, blob.type)}`,
    data: btoa(binary), directory: Directory.Cache, recursive: true });
  return result.uri;
}

export async function viewNativeAttachment(blob, name, { filesystem = Filesystem, viewer = FileViewer, signal } = {}) {
  await assertPdfAttachment(blob);
  if (signal?.aborted) return;
  const uri = await cacheAttachment(blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' }), name, filesystem);
  if (signal?.aborted) return;
  await viewer.openDocumentFromLocalPath({ path: uri });
}

export async function saveNativeAttachment(blob, name, { filesystem = Filesystem, share = Share } = {}) {
  const uri = await cacheAttachment(blob, name, filesystem);
  try {
    await share.share({ title: name, files: [uri], dialogTitle: 'حفظ الملف' });
  } catch (error) {
    if (error.message !== 'Share canceled') throw error;
    // Dismissing the native sheet is a cancellation, not a failed download.
  }
}
