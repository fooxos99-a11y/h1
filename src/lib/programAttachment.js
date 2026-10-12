const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const imageTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp']);
const invalidFile = () => new Error('تعذر فتح الملف المرفق.');

export function prepareProgramAttachment(attachment) {
  const value = String(attachment?.value || '').trim();
  const match = /^data:([a-zA-Z0-9.+/-]+);base64,([a-zA-Z0-9+/]+={0,2})$/.exec(value);
  if (!match) {
    if (!/^https?:\/\//i.test(value) && !/^\/(?!\/)/.test(value)) throw invalidFile();
    const kind = attachment.type === 'image' ? 'image' : attachment.type === 'pdf' ? 'pdf' : 'file';
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
