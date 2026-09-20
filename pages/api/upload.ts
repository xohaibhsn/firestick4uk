import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { requireAdmin } from '../../lib/adminAuth';
import { canUploadPurpose, resolveUploadPurpose } from '../../lib/adminPermissions';

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const { file, name, folder } = req.body;
    if (!file || !name) return res.status(400).json({ error: 'No file provided' });

    const resolved = resolveUploadPurpose(folder);
    if (!resolved) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission for this action.',
        detail: 'Unapproved upload folder',
      });
    }

    if (!canUploadPurpose(admin.role, resolved.purpose)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission for this action.',
      });
    }

    const cloudinaryFolder = resolved.folder;
    const isReceipt = resolved.purpose === 'receipts';
    const isLogo = resolved.purpose === 'logo';
    const isWhatsAppIcon = resolved.purpose === 'whatsapp';
    const isHeroSlide = resolved.purpose === 'hero';
    const isOg = resolved.purpose === 'og';
    const preserveImage = isReceipt || isLogo || isWhatsAppIcon || isHeroSlide || isOg;

    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
      const cloudinary = (await import('../../lib/cloudinary')).default;

      const uploadOptions: any = { folder: cloudinaryFolder };

      if (isLogo) {
        uploadOptions.transformation = [
          { width: 800, height: 200, crop: 'limit' },
          { quality: 90 },
        ];
      } else if (isWhatsAppIcon) {
        uploadOptions.transformation = [
          { width: 512, height: 512, crop: 'limit' },
          { quality: 90 },
        ];
      } else if (isOg) {
        uploadOptions.transformation = [
          { width: 1200, height: 630, crop: 'limit' },
          { quality: 90 },
        ];
      } else if (isHeroSlide) {
        uploadOptions.transformation = [
          { width: 1920, height: 1080, crop: 'limit' },
          { quality: 85, fetch_format: 'webp' },
        ];
      } else if (isReceipt) {
        uploadOptions.transformation = [{ quality: 90 }];
      } else {
        uploadOptions.transformation = [
          { width: 800, height: 800, crop: 'limit' },
          { quality: 85, fetch_format: 'webp' },
        ];
      }

      const result = await cloudinary.uploader.upload(file, uploadOptions);
      return res.status(200).json({ path: result.secure_url });
    }

    const base64Data = file.replace(/^data:[^;]+;base64,/, '');
    const localSub = isReceipt ? 'receipts' : isLogo ? 'logo' : isWhatsAppIcon ? 'whatsapp' : '';
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', localSub);
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const safeName = Date.now() + '-' + String(name).replace(/[^a-zA-Z0-9._-]/g, '_');

    if (!preserveImage) {
      try {
        const sharp = require('sharp');
        const inputBuffer = Buffer.from(base64Data, 'base64');
        const webpName = safeName.replace(/\.[^.]+$/, '.webp');
        await sharp(inputBuffer).resize(800, 800, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toFile(path.join(uploadsDir, webpName));
        return res.status(200).json({ path: `/uploads/${webpName}` });
      } catch { /* sharp not available, fall through */ }
    }

    fs.writeFileSync(path.join(uploadsDir, safeName), base64Data, 'base64');
    const sub = localSub ? `${localSub}/` : '';
    return res.status(200).json({ path: `/uploads/${sub}${safeName}` });

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
