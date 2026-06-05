import pool from '../../../lib/db';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {

    // Auto-add reports_to column if not exists
    try { await pool.query('ALTER TABLE erp_users ADD COLUMN reports_to INT NULL'); } catch (_) {}

    if (req.method === 'GET') {
      const { role_filter, reports_to, id: emp_id } = req.query;

      // Single employee by id
      if (emp_id) {
        const [rows]: any = await pool.query('SELECT id,name,email,role,department,salary,joining_date,active,reports_to FROM erp_users WHERE id=?', [emp_id]);
        return res.status(200).json(rows[0]||null);
      }

      // For dropdown: get managers or admins
      if (role_filter) {
        const roles = String(role_filter).split(',');
        const placeholders = roles.map(()=>'?').join(',');
        const [rows] = await pool.query(`SELECT id,name,role FROM erp_users WHERE role IN (${placeholders}) AND active=1 ORDER BY name`, roles);
        return res.status(200).json(Array.isArray(rows)?rows:[]);
      }

      // Reporting employees (for manager)
      if (reports_to) {
        const [rows] = await pool.query('SELECT id,name,role,department FROM erp_users WHERE reports_to=? AND active=1 ORDER BY name', [reports_to]);
        return res.status(200).json(Array.isArray(rows)?rows:[]);
      }

      const [rows] = await pool.query(`
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
      const [result]: any = await pool.query(
        'INSERT INTO erp_users (name,email,password,role,department,salary,joining_date,reports_to) VALUES (?,?,?,?,?,?,?,?)',
        [name, email, password, role||'employee', department||'', salary||0, joining_date||null, reports_to||null]
      );
      // Step 3: vendor role maps to 'vendor' account type, all others map to 'employee'
      const accountType = (role === 'vendor') ? 'vendor' : 'employee';
      await pool.query('INSERT INTO erp_accounts (name,type,reference_id) VALUES (?,?,?)', [name, accountType, result.insertId]);
      return res.status(200).json({ success: true, id: result.insertId });
    }

    if (req.method === 'PUT') {
      const { id, name, email, role, department, salary, joining_date, active, reports_to } = req.body;
      await pool.query(
        'UPDATE erp_users SET name=?,email=?,role=?,department=?,salary=?,joining_date=?,active=?,reports_to=? WHERE id=?',
        [name, email, role, department||'', salary||0, joining_date||null, active??1, reports_to||null, id]
      );
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      await pool.query('UPDATE erp_users SET active=0 WHERE id=?', [id]);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
