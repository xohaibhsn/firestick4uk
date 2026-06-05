import type { NextApiRequest, NextApiResponse } from 'next';
import pool from '../../lib/db';
import { createHash } from 'crypto';

function checkAdminAuth(req: NextApiRequest): boolean {
  const session = req.headers['x-admin-session'] || req.cookies?.sAdminSession;
  return !!session;
}

function checkSuperAdmin(req: NextApiRequest): boolean {
  try {
    const s = req.headers['x-admin-role'] as string;
    return s === 'super_admin';
  } catch { return false; }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });

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

    if (req.method === 'GET') {
      const [rows] = await pool.query('SELECT id,name,email,role,active,created_at FROM admin_staff ORDER BY created_at DESC');
      return res.status(200).json(Array.isArray(rows) ? rows : []);
    }

    // POST/PUT/DELETE require super_admin
    if (!checkSuperAdmin(req)) {
      return res.status(403).json({ error: 'Only super_admin can manage staff users' });
    }

    if (req.method === 'POST') {
      const { name, email, password, role } = req.body;
      if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });
      const validRoles = ['super_admin','manager','writer'];
      const finalRole = validRoles.includes(role) ? role : 'writer';
      const hash = createHash('sha256').update(password).digest('hex');
      const [result]: any = await pool.query(
        'INSERT INTO admin_staff (name,email,password_hash,role) VALUES (?,?,?,?)',
        [name, email, hash, finalRole]
      );
      return res.status(200).json({ success: true, id: result.insertId });
    }

    if (req.method === 'PUT') {
      const { id, name, email, role, password, active } = req.body;
      if (!id) return res.status(400).json({ error: 'ID required' });
      const validRoles = ['super_admin','manager','writer'];
      const finalRole = validRoles.includes(role) ? role : 'writer';
      if (password) {
        const hash = createHash('sha256').update(password).digest('hex');
        await pool.query('UPDATE admin_staff SET name=?,email=?,role=?,password_hash=?,active=? WHERE id=?',
          [name, email, finalRole, hash, active??1, id]);
      } else {
        await pool.query('UPDATE admin_staff SET name=?,email=?,role=?,active=? WHERE id=?',
          [name, email, finalRole, active??1, id]);
      }
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      await pool.query('DELETE FROM admin_staff WHERE id=?', [id]);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
