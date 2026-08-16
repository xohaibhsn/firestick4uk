import type { NextApiRequest, NextApiResponse } from 'next';
import pool from '../../lib/db';
import cloudinary from '../../lib/cloudinary';

export const config = { api: { bodyParser: { sizeLimit: '2mb' } } };

function checkAdminAuth(req: any): boolean {
  const session = req.headers['x-admin-session'] || req.cookies?.sAdminSession;
  return !!session;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const { file, name } = req.body;
    if (!file || !name) return res.status(400).json({ error: 'No file provided' });

    const ext = (name as string).toLowerCase().split('.').pop();
    if (!['ico', 'png', 'jpg', 'jpeg', 'svg'].includes(ext || '')) {
      return res.status(400).json({ error: 'Invalid file type. Use .ico, .png, .jpg, or .svg' });
    }

    // Unique public_id so Cloudinary URL changes on each upload (busts CDN/browser cache)
    const stamp = Date.now();
    const result = await cloudinary.uploader.upload(file, {
      folder: 'firestick4uk/favicon',
      public_id: `favicon-${stamp}`,
      overwrite: true,
      invalidate: true,
      transformation: [{ width: 180, height: 180, crop: "fit", quality: "auto", fetch_format: "png" }],
    });

    const publicUrl = `${result.secure_url}?v=${result.version || stamp}`;

    await pool.query(
      `INSERT INTO site_content (content_key, content_value, content_type, page_name, label)
       VALUES ('favicon_url', ?, 'image', 'settings', 'Favicon URL')
       ON DUPLICATE KEY UPDATE
         content_value = VALUES(content_value),
         content_type = 'image',
         page_name = 'settings',
         label = 'Favicon URL'`,
      [publicUrl]
    );

    return res.status(200).json({ success: true, url: publicUrl });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
