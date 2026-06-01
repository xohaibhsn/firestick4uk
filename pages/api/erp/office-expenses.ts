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

    await conn.query(`
      CREATE TABLE IF NOT EXISTS erp_office_expenses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        date DATE NOT NULL,
        category VARCHAR(100),
        description TEXT,
        amount DECIMAL(10,2),
        paid_by VARCHAR(255),
        receipt_path VARCHAR(500),
        notes TEXT,
        added_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    if (req.method === 'GET') {
      const { month, category, summary } = req.query;

      // Monthly summary per category
      if (summary) {
        const m = String(month || new Date().toISOString().slice(0,7));
        const [rows] = await conn.query(
          'SELECT category, SUM(amount) as total, COUNT(*) as count FROM erp_office_expenses WHERE date LIKE ? GROUP BY category ORDER BY total DESC',
          [`${m}%`]
        );
        const [total]: any = await conn.query(
          'SELECT COALESCE(SUM(amount),0) as total FROM erp_office_expenses WHERE date LIKE ?',
          [`${m}%`]
        );
        return res.status(200).json({ categories: Array.isArray(rows)?rows:[], total: Number(total[0]?.total||0) });
      }

      let query = 'SELECT * FROM erp_office_expenses WHERE 1=1';
      const params: any[] = [];
      if (month) { query += ' AND date LIKE ?'; params.push(`${month}%`); }
      if (category) { query += ' AND category=?'; params.push(category); }
      query += ' ORDER BY date DESC, created_at DESC';
      const [rows] = await conn.query(query, params);
      return res.status(200).json(Array.isArray(rows)?rows:[]);
    }

    if (req.method === 'POST') {
      const { date, category, description, amount, paid_by, receipt_path, notes, added_by } = req.body;
      if (!date || !amount) return res.status(400).json({ error: 'Date and amount required' });
      const [result]: any = await conn.query(
        'INSERT INTO erp_office_expenses (date,category,description,amount,paid_by,receipt_path,notes,added_by) VALUES (?,?,?,?,?,?,?,?)',
        [date, category||'Miscellaneous', description||'', amount, paid_by||'', receipt_path||'', notes||'', added_by||'']
      );
      return res.status(200).json({ success:true, id:result.insertId });
    }

    if (req.method === 'PUT') {
      const { id, date, category, description, amount, paid_by, receipt_path, notes } = req.body;
      if (!id) return res.status(400).json({ error: 'ID required' });
      await conn.query(
        'UPDATE erp_office_expenses SET date=?,category=?,description=?,amount=?,paid_by=?,receipt_path=?,notes=? WHERE id=?',
        [date, category, description||'', amount, paid_by||'', receipt_path||'', notes||'', id]
      );
      return res.status(200).json({ success:true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      await conn.query('DELETE FROM erp_office_expenses WHERE id=?', [id]);
      return res.status(200).json({ success:true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  } finally {
    if (conn) try { await conn.end(); } catch (_) {}
  }
}
