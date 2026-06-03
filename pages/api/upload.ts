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

    const base64Data = file.replace(/^data:[^;]+;base64,/, '');
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const ext = path.extname(String(name)).toLowerCase();
    const isImage = ['.jpg','.jpeg','.png','.webp','.gif'].includes(ext);
    const safeName = Date.now() + '-' + String(name).replace(/[^a-zA-Z0-9._-]/g, '_');

    // Convert images to WebP using sharp (built into Next.js)
    if (isImage && ext !== '.gif') {
      try {
        const sharp = require('sharp');
        const inputBuffer = Buffer.from(base64Data, 'base64');
        const webpName = safeName.replace(/\.[^.]+$/, '.webp');
        const webpPath = path.join(uploadsDir, webpName);

        await sharp(inputBuffer)
          .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 85 })
          .toFile(webpPath);

        return res.status(200).json({ path: `/uploads/${webpName}` });
      } catch {
        // sharp not available — fall back to original
      }
    }

    // Fallback: save original
    const filePath = path.join(uploadsDir, safeName);
    fs.writeFileSync(filePath, base64Data, 'base64');
    return res.status(200).json({ path: `/uploads/${safeName}` });

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
