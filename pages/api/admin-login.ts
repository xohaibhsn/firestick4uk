import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { RL_AUTH, getClientIp } from '../../lib/rateLimit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { allowed } = RL_AUTH(getClientIp(req));
  if (!allowed) return res.status(429).json({ error: 'Too many login attempts. Try again in 15 minutes.' });

  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ success: false, error: 'Missing credentials' });

  if (username !== 'admin') {
    return res.status(401).json({ success: false });
  }

  // Debug: log first 8 chars of env vars (safe to log partial)
  const hashEnv   = process.env.ADMIN_PASSWORD_HASH;
  const sha256Env = process.env.ADMIN_PASSWORD_SHA256;
  const plainEnv  = process.env.ADMIN_PASSWORD;

  console.log('[admin-login] ADMIN_PASSWORD_HASH set:', !!hashEnv, hashEnv ? hashEnv.substring(0, 8) : 'NOT SET');
  console.log('[admin-login] ADMIN_PASSWORD_SHA256 set:', !!sha256Env, sha256Env ? sha256Env.substring(0, 8) : 'NOT SET');
  console.log('[admin-login] ADMIN_PASSWORD set:', !!plainEnv);

  // METHOD 1: SHA-256 (no $ signs — Hostinger-safe, recommended)
  if (sha256Env) {
    const inputHash = crypto.createHash('sha256').update(String(password)).digest('hex');
    if (inputHash === sha256Env) {
      console.log('[admin-login] SHA-256 match ✅');
      return res.status(200).json({ success: true });
    }
    console.log('[admin-login] SHA-256 mismatch ❌');
  }

  // METHOD 2: bcrypt (may fail if Hostinger corrupts $ signs in env var)
  if (hashEnv && hashEnv.startsWith('$2')) {
    try {
      const bcrypt = require('bcryptjs');
      const match = await bcrypt.compare(String(password), hashEnv);
      if (match) {
        console.log('[admin-login] bcrypt match ✅');
        return res.status(200).json({ success: true });
      }
      console.log('[admin-login] bcrypt mismatch ❌');
    } catch (err: any) {
      console.error('[admin-login] bcrypt error:', err.message);
    }
  }

  // METHOD 3: Plain text fallback (set ADMIN_PASSWORD in Hostinger for emergency)
  if (plainEnv && String(password) === plainEnv) {
    console.log('[admin-login] Plain match ✅');
    return res.status(200).json({ success: true });
  }

  // No method matched
  if (!hashEnv && !sha256Env && !plainEnv) {
    console.error('[admin-login] NO password env var set! Set ADMIN_PASSWORD_SHA256 in Hostinger.');
    return res.status(500).json({ success: false, error: 'Server not configured' });
  }

  return res.status(401).json({ success: false });
}
