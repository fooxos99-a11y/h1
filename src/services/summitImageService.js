import { request } from '@/services/studentsApi';
import { getApiBase, getTenantRegistrationNumber } from '@/services/apiBase';
import { getAuthSessionVersion } from '@/lib/authSession';

const images = new Map();
const imageKey = (id) => JSON.stringify([getApiBase(), getTenantRegistrationNumber(), getAuthSessionVersion(), id]);

export function loadSummitImage(id) {
  const key = imageKey(id);
  if (!images.has(key)) {
    if (images.size >= 24) images.delete(images.keys().next().value);
    images.set(key, request(`/summit/images/${id}`).then((result) => result.imageData).catch((error) => {
      images.delete(key);
      throw error;
    }));
  }
  return images.get(key);
}

export async function uploadSummitImage(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) {
    throw new Error('اختر صورة JPG أو PNG أو WebP بحجم لا يتجاوز 15 ميجابايت.');
  }
  const bitmap = await createImageBitmap(file);
  let imageData;
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      imageData = canvas.toDataURL('image/jpeg', quality);
      if (imageData.length <= 650000) break;
    }
  } finally { bitmap.close(); }
  if (imageData.length > 650000) throw new Error('الصورة كبيرة؛ اختر صورة أصغر.');
  const { id } = await request('/summit/images', { method: 'POST', body: JSON.stringify({ imageData }) });
  images.set(imageKey(id), Promise.resolve(imageData));
  return id;
}
