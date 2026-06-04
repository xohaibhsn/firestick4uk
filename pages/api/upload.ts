import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { file, name } = req.body;
    if (!file || !name) return res.status(400).json({ error: 'No file provided' });

    // Use Cloudinary if credentials are configured
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
      const cloudinary = (await import('../../lib/cloudinary')).default;
      const result = await cloudinary.uploader.upload(file, {
        folder: 'firestick4uk/products',
        transformation: [
          { width: 800, height: 800, crop: 'limit' },
          { quality: 85, fetch_format: 'webp' },
        ],
      });
      return res.status(200).json({ path: result.secure_url });
    }

    // Fallback: save locally (localhost dev without Cloudinary creds)
    const base64Data = file.replace(/^data:[^;]+;base64,/, '');
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const ext = path.extname(String(name)).toLowerCase() || '.jpg';
    const safeName = Date.now() + '-' + String(name).replace(/[^a-zA-Z0-9._-]/g, '_');

    try {
      const sharp = require('sharp');
      const inputBuffer = Buffer.from(base64Data, 'base64');
      const webpName = safeName.replace(/\.[^.]+$/, '.webp');
      await sharp(inputBuffer).resize(800, 800, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toFile(path.join(uploadsDir, webpName));
      return res.status(200).json({ path: `/uploads/${webpName}` });
    } catch {
      fs.writeFileSync(path.join(uploadsDir, safeName), base64Data, 'base64');
      return res.status(200).json({ path: `/uploads/${safeName}` });
    }

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
