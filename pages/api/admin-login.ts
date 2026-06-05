import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { RL_AUTH, getClientIp } from '../../lib/rateLimit';
import pool from '../../lib/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { allowed } = RL_AUTH(getClientIp(req));
  if (!allowed) return res.status(429).json({ error: 'Too many login attempts. Try again in 15 minutes.' });

  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ success: false, error: 'Missing credentials' });

  // ── Check admin_staff table first (multi-user RBAC) ───────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_staff (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('super_admin','manager','writer') DEFAULT 'writer',
        active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const inputHash = crypto.createHash('sha256').update(String(password)).digest('hex');
    const [rows]: any = await pool.query(
      'SELECT id,name,email,role FROM admin_staff WHERE email=? AND password_hash=? AND active=1',
      [username, inputHash]
    );
    if (rows.length) {
      return res.status(200).json({ success: true, role: rows[0].role, name: rows[0].name, staffUser: true });
    }
  } catch (_) { /* DB not ready yet — fall through to master admin check */ }

  // ── Master admin login (username must be 'admin') ─────────────────────────
  if (username !== 'admin') {
    return res.status(401).json({ success: false });
  }

  const hashEnv   = process.env.ADMIN_PASSWORD_HASH;
  const sha256Env = process.env.ADMIN_PASSWORD_SHA256;
  const plainEnv  = process.env.ADMIN_PASSWORD;

  if (sha256Env) {
    const inputHash = crypto.createHash('sha256').update(String(password)).digest('hex');
    if (inputHash === sha256Env) return res.status(200).json({ success: true, role: 'super_admin', name: 'Admin' });
  }

  if (hashEnv && hashEnv.startsWith('$2')) {
    try {
      const bcrypt = require('bcryptjs');
      const match = await bcrypt.compare(String(password), hashEnv);
      if (match) return res.status(200).json({ success: true, role: 'super_admin', name: 'Admin' });
    } catch (_) {}
  }

  if (plainEnv && String(password) === plainEnv) {
    return res.status(200).json({ success: true, role: 'super_admin', name: 'Admin' });
  }

  if (!hashEnv && !sha256Env && !plainEnv) {
    return res.status(500).json({ success: false, error: 'Server not configured' });
  }

  return res.status(401).json({ success: false });
}
