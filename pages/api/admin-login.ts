import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { username, password } = req.body;
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  if (username === 'admin' && password === adminPass) {
    return res.status(200).json({ success: true });
  }
  return res.status(401).json({ success: false });
}
