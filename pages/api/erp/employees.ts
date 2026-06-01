import type { NextApiRequest, NextApiResponse } from 'next';

const getDB = async () => {
  const mysql = require('mysql2/promise');
  return Promise.race([
    mysql.createConnection({ host: process.env.DB_HOST||'srv497.hstgr.io', user: process.env.DB_USER||'u992747032_firestick4uk', password: process.env.DB_PASSWORD||'Firestick@2026', database: process.env.DB_NAME||'u992747032_firestick4uk', port: 3306, connectTimeout: 5000 }),
    new Promise((_,reject) => setTimeout(()=>reject(new Error('timeout')),6000)),
  ]);
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let conn: any;
  try {
    conn = await getDB();

    // Auto-add reports_to column if not exists
    try { await conn.query('ALTER TABLE erp_users ADD COLUMN reports_to INT NULL'); } catch (_) {}

    if (req.method === 'GET') {
      const { role_filter } = req.query;
      // For dropdown: get managers or admins
      if (role_filter) {
        const roles = String(role_filter).split(',');
        const placeholders = roles.map(()=>'?').join(',');
        const [rows] = await conn.query(`SELECT id,name,role FROM erp_users WHERE role IN (${placeholders}) AND active=1 ORDER BY name`, roles);
        return res.status(200).json(Array.isArray(rows)?rows:[]);
      }
      const [rows] = await conn.query(`
        SELECT u.id,u.name,u.email,u.role,u.department,u.salary,u.joining_date,u.active,u.created_at,u.reports_to,
          m.name as reports_to_name
        FROM erp_users u
        LEFT JOIN erp_users m ON u.reports_to = m.id
        ORDER BY u.created_at DESC
      `);
      return res.status(200).json(Array.isArray(rows) ? rows : []);
    }

    if (req.method === 'POST') {
      const { name, email, password, role, department, salary, joining_date, reports_to } = req.body;
      if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });
      const [result]: any = await conn.query(
        'INSERT INTO erp_users (name,email,password,role,department,salary,joining_date,reports_to) VALUES (?,?,?,?,?,?,?,?)',
        [name, email, password, role||'employee', department||'', salary||0, joining_date||null, reports_to||null]
      );
      await conn.query('INSERT INTO erp_accounts (name,type,reference_id) VALUES (?,?,?)', [name, 'employee', result.insertId]);
      return res.status(200).json({ success: true, id: result.insertId });
    }

    if (req.method === 'PUT') {
      const { id, name, email, role, department, salary, joining_date, active, reports_to } = req.body;
      await conn.query(
        'UPDATE erp_users SET name=?,email=?,role=?,department=?,salary=?,joining_date=?,active=?,reports_to=? WHERE id=?',
        [name, email, role, department||'', salary||0, joining_date||null, active??1, reports_to||null, id]
      );
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      await conn.query('UPDATE erp_users SET active=0 WHERE id=?', [id]);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  } finally {
    if (conn) try { await conn.end(); } catch (_) {}
  }
}
