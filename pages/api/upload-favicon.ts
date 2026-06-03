import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import pool from '../../lib/db';

export const config = { api: { bodyParser: { sizeLimit: '2mb' } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { file, name } = req.body;
    if (!file || !name) return res.status(400).json({ error: 'No file provided' });

    const ext = path.extname(name).toLowerCase();
    if (!['.ico','.png','.jpg','.jpeg','.svg'].includes(ext)) {
      return res.status(400).json({ error: 'Invalid file type. Use .ico, .png, .jpg, or .svg' });
    }

    const base64Data = file.replace(/^data:[^;]+;base64,/, '');
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'favicon');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const fileName = `favicon${ext}`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, base64Data, 'base64');

    if (ext === '.ico' || ext === '.png') {
      fs.writeFileSync(path.join(process.cwd(), 'public', 'favicon.ico'), base64Data, 'base64');
    }

    const publicUrl = `/uploads/favicon/${fileName}`;

    try {
      await pool.query('UPDATE site_content SET content_value=? WHERE content_key="favicon_url"', [publicUrl]);
    } catch (_) {}

    return res.status(200).json({ success: true, url: publicUrl });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
