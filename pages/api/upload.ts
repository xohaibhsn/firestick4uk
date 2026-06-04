import type { NextApiRequest, NextApiResponse } from 'next';
import cloudinary from '../../lib/cloudinary';

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { file, name } = req.body;
    if (!file || !name) return res.status(400).json({ error: 'No file provided' });

    // file is already a base64 data URI — Cloudinary accepts it directly
    const result = await cloudinary.uploader.upload(file, {
      folder: 'firestick4uk/products',
      transformation: [
        { width: 800, height: 800, crop: 'limit' },
        { quality: 85, fetch_format: 'webp' },
      ],
    });

    return res.status(200).json({ path: result.secure_url });

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
