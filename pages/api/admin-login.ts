import type { NextApiRequest, NextApiResponse } from 'next';
import bcrypt from 'bcryptjs';
import { RL_AUTH, getClientIp } from '../../lib/rateLimit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { allowed } = RL_AUTH(getClientIp(req));
  if (!allowed) return res.status(429).json({ error: 'Too many login attempts. Try again in 15 minutes.' });

  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ success: false });

  const storedHash = process.env.ADMIN_PASSWORD_HASH;

  if (username !== 'admin') {
    return res.status(401).json({ success: false });
  }

  if (storedHash) {
    // Use bcrypt hash comparison
    const match = await bcrypt.compare(String(password), storedHash);
    if (match) return res.status(200).json({ success: true });
    return res.status(401).json({ success: false });
  }

  // Fallback: plain password (only for local dev if hash not set)
  const plain = process.env.ADMIN_PASSWORD || '';
  if (plain && password === plain) return res.status(200).json({ success: true });

  return res.status(401).json({ success: false });
}
