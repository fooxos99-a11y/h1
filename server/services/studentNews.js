import sharp from 'sharp';
const invalid = message => Object.assign(new Error(message), { statusCode: 422 });
export async function normalizeStudentNews(body, savedImages = []) {
  const title = String(body.title || '').trim();
  if (!title || title.length > 80) throw invalid('اكتب المسمى بحد أقصى ٨٠ حرفًا.');
  if (!Array.isArray(body.images) || body.images.length > 8) throw invalid('الحد الأقصى ٨ صور.');
  if (!Array.isArray(body.studentIds) || body.studentIds.length > 5000 || body.studentIds.some(id => !Number.isSafeInteger(id) || id < 1)) throw invalid('قائمة الطلاب غير صالحة.');
  const expiresOn = String(body.expiresOn || '');
  if (expiresOn && (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) || !Number.isFinite(Date.parse(expiresOn)) || new Date(expiresOn).toISOString().slice(0, 10) !== expiresOn)) throw invalid('تاريخ الانتهاء غير صالح.');
  if (!Number.isSafeInteger(body.revision) || body.revision < 0) throw invalid('أعد تحميل الأخبار قبل الحفظ.');
  const images = [];
  for (const source of body.images) {
    if (typeof source !== 'string' || source.length > 7_000_000 || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(source)) throw invalid('اختر صورة PNG أو JPEG أو WebP بحجم أقصاه ٥ ميجابايت.');
    // Keep previously validated copies intact when only the title, order or audience changes.
    if (savedImages.includes(source)) { images.push(source); continue; }
    try {
      const buffer = await sharp(Buffer.from(source.split(',')[1], 'base64'), { limitInputPixels: 40_000_000 })
        .rotate().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 88 }).timeout({ seconds: 5 }).toBuffer();
      images.push(`data:image/webp;base64,${buffer.toString('base64')}`);
    } catch { throw invalid('إحدى الصور غير قابلة للقراءة. اختر صورة أخرى.'); }
  }
  if (images.join('').length > 5_000_000) throw invalid('حجم الصور الإجمالي كبير؛ قلل عدد الصور أو أحجامها.');
  return { title, images, expiresOn, studentIds: [...new Set(body.studentIds)], enabled: body.enabled === true };
}
