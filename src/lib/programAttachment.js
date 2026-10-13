export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const imageTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp']);
const invalidFile = () => new Error('تعذر فتح الملف المرفق.');

export function prepareProgramAttachment(attachment) {
  const value = String(attachment?.value || '').trim();
  const match = /^data:([a-zA-Z0-9.+/-]+);base64,([a-zA-Z0-9+/]+={0,2})$/.exec(value);
  if (!match) {
    if (!/^https?:\/\//i.test(value) && !/^\/(?!\/)/.test(value)) throw invalidFile();
    const kind = attachment.type === 'pdf' || attachment.mimeType === 'application/pdf' || /\.pdf$/i.test(attachment.fileName || '')
      ? 'pdf' : attachment.type === 'image' ? 'image' : 'file';
    return { kind, url: value, blob: null };
  }
  if (match[2].length > Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4) throw invalidFile();
  let binary;
  try { binary = atob(match[2]); } catch { throw invalidFile(); }
  if (!binary.length || binary.length > MAX_ATTACHMENT_BYTES) throw invalidFile();
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  let mimeType = match[1].toLowerCase();
  if (binary.startsWith('%PDF-')) mimeType = 'application/pdf';
  else if (binary.startsWith('\x89PNG\r\n\x1a\n')) mimeType = 'image/png';
  else if (binary.startsWith('\xff\xd8\xff')) mimeType = 'image/jpeg';
  else if (/^GIF8[79]a/.test(binary)) mimeType = 'image/gif';
  else if (binary.startsWith('RIFF') && binary.slice(8, 12) === 'WEBP') mimeType = 'image/webp';
  const kind = mimeType === 'application/pdf' ? 'pdf' : imageTypes.has(mimeType) ? 'image' : 'file';
  // Other file types stay downloads and cannot become executable same-origin HTML or SVG.
  return { kind, blob: new Blob([bytes], { type: kind === 'file' ? 'application/octet-stream' : mimeType }), url: '' };
}

export function attachmentFileName(name, mimeType) {
  const basename = String(name || 'ملف مرفق').split(/[\\/]/).pop();
  const clean = Array.from(basename).filter(char => char.codePointAt(0) >= 32 && char.codePointAt(0) !== 127).join('')
    .replace(/[<>:"|?*]/g, '_').trim();
  // Keep Arabic names while staying below the native filesystem's byte limit.
  let filename = !clean || clean === '.' || clean === '..' ? 'ملف مرفق' : clean;
  let extension = /(\.[a-z0-9]{1,12})$/i.exec(filename)?.[1] || '';
  if (mimeType === 'application/pdf' && !/^\.pdf$/i.test(extension)) extension = '.pdf';
  else if (extension) filename = filename.slice(0, -extension.length);
  const encoder = new TextEncoder();
  while (encoder.encode(filename + extension).length > 200) filename = Array.from(filename).slice(0, -1).join('');
  return filename + extension;
}

export function attachmentRequestOptions(url, apiUrl, { token = '', registrationNumber = '', native = false } = {}) {
  const target = new URL(url);
  const api = new URL(apiUrl);
  const trusted = target.origin === api.origin && (target.pathname === api.pathname || target.pathname.startsWith(`${api.pathname.replace(/\/$/, '')}/`));
  return {
    credentials: trusted ? 'include' : 'omit',
    headers: trusted ? {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Registration-Number': registrationNumber,
      'X-Madarij-Native': native ? '1' : '0',
    } : {},
    redirect: trusted ? 'error' : 'follow',
  };
}

export async function readAttachmentBlob(source, options = {}, fetchFile = globalThis.fetch) {
  if (source.blob) return source.blob;
  const response = await fetchFile(source.url, options);
  if (!response.ok) throw new Error('تعذر تحميل الملف. حاول مرة أخرى.');
  if (Number(response.headers.get('content-length')) > MAX_ATTACHMENT_BYTES) throw invalidFile();
  let blob;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_ATTACHMENT_BYTES) { await reader.cancel(); throw invalidFile(); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    blob = new Blob(chunks, { type: response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream' });
  } else blob = await response.blob();
  if (!blob.size || blob.size > MAX_ATTACHMENT_BYTES) throw invalidFile();
  if (source.kind === 'pdf') await assertPdfAttachment(blob);
  return blob.type === 'application/pdf' || imageTypes.has(blob.type) ? blob : new Blob([blob], { type: 'application/octet-stream' });
}

export async function assertPdfAttachment(blob) {
  if (!((await blob.slice(0, 1024).text()).includes('%PDF-'))) throw invalidFile();
}
