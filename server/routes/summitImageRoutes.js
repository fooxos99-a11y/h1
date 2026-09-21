import express from 'express';
import { createHash } from 'node:crypto';
import { normalizeSummitImageId } from '../../shared/summit-scenes.js';

export function validateSummitImage(value) {
  const data = String(value || '');
  if (data.length > 700000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(data)) return null;
  const bytes = Buffer.from(data.split(',')[1], 'base64');
  if (bytes.length < 4 || bytes.length > 500000 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) return null;
  return { id: createHash('sha256').update(bytes).digest('hex'), data };
}

export default function createSummitImageRouter({ db, requirePermission }) {
  const router = express.Router();
  router.post('/', requirePermission('settings'), async (req, res, next) => {
    try {
      const image = validateSummitImage(req.body.imageData);
      if (!image) return res.status(422).json({ message: 'الصورة غير صالحة أو أكبر من الحجم المسموح.' });
      await db().query('INSERT IGNORE INTO summit_map_images (id, image_data) VALUES (?, ?)', [image.id, image.data]);
      res.status(201).json({ id: image.id });
    } catch (error) { next(error); }
  });
  router.get('/:id', async (req, res, next) => {
    try {
      const id = normalizeSummitImageId(req.params.id);
      if (!id) return res.status(404).json({ message: 'الصورة غير موجودة.' });
      const [[row]] = await db().query('SELECT image_data AS imageData FROM summit_map_images WHERE id = ?', [id]);
      if (!row) return res.status(404).json({ message: 'الصورة غير موجودة.' });
      res.json(row);
    } catch (error) { next(error); }
  });
  return router;
}
