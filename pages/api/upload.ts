import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { file, name } = req.body;

    if (!file || !name) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const base64Data = file.replace(/^data:[^;]+;base64,/, '');
    const safeName = Date.now() + '-' + String(name).replace(/[^a-zA-Z0-9._-]/g, '_');
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');

    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    fs.writeFileSync(path.join(uploadsDir, safeName), base64Data, 'base64');

    return res.status(200).json({ path: `/uploads/${safeName}` });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
