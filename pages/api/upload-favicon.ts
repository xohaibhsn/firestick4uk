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
    if (!['ico','png','jpg','jpeg','svg'].includes(ext || '')) {
      return res.status(400).json({ error: 'Invalid file type. Use .ico, .png, .jpg, or .svg' });
    }

    const result = await cloudinary.uploader.upload(file, {
      folder: 'firestick4uk/favicon',
      public_id: 'favicon',
      overwrite: true,
      transformation: [{ width: 64, height: 64, crop: 'limit' }],
    });

    const publicUrl = result.secure_url;

    try {
      await pool.query('UPDATE site_content SET content_value=? WHERE content_key="favicon_url"', [publicUrl]);
    } catch (_) {}

    return res.status(200).json({ success: true, url: publicUrl });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
