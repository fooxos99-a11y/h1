import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileViewer } from '@capacitor/file-viewer';
import { Share } from '@capacitor/share';
import { attachmentFileName, MAX_ATTACHMENT_BYTES, assertPdfAttachment } from '../lib/programAttachment.js';

async function cacheAttachment(blob, name, filesystem) {
  if (!blob.size || blob.size > MAX_ATTACHMENT_BYTES) throw new Error('تعذر فتح الملف المرفق.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const hash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  let binary = '';
  for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  // Content-addressed cache files remain available while Quick Look / the share sheet uses them.
  const result = await filesystem.writeFile({ path: `program-attachments/${hash}/${attachmentFileName(name, blob.type)}`,
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
