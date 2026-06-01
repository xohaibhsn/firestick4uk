import type { NextApiRequest, NextApiResponse } from 'next';

const getDB = async () => {
  const mysql = require('mysql2/promise');
  return Promise.race([
    mysql.createConnection({ host: process.env.DB_HOST||'srv497.hstgr.io', user: process.env.DB_USER||'u992747032_firestick4uk', password: process.env.DB_PASSWORD||'Firestick@2026', database: process.env.DB_NAME||'u992747032_firestick4uk', port: 3306, connectTimeout: 5000 }),
    new Promise((_,reject) => setTimeout(()=>reject(new Error('timeout')),6000)),
  ]);
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let conn;
  try {
    conn = await getDB();

    if (req.method === 'GET') {
      const { employee_id } = req.query;
      let query = 'SELECT e.*,u.name as employee_name FROM erp_expenses e JOIN erp_users u ON e.employee_id=u.id';
      const params: any[] = [];
      if (employee_id) { query += ' WHERE e.employee_id=?'; params.push(employee_id); }
      query += ' ORDER BY e.created_at DESC';
      const [rows] = await conn.query(query, params);
      return res.status(200).json(Array.isArray(rows) ? rows : []);
    }

    if (req.method === 'POST') {
      const { employee_id, amount, description, category, receipt_path } = req.body;
      if (!employee_id || !amount) return res.status(400).json({ error: 'Missing required fields' });
      const [result]: any = await conn.query(
        'INSERT INTO erp_expenses (employee_id,amount,description,category,receipt_path) VALUES (?,?,?,?,?)',
        [employee_id, amount, description||'', category||'Other', receipt_path||'']
      );
      return res.status(200).json({ success: true, id: result.insertId });
    }

    if (req.method === 'PATCH') {
      const { id, status, admin_note, approved_by } = req.body;
      if (!id || !status) return res.status(400).json({ error: 'Missing fields' });

      const [expRows]: any = await conn.query('SELECT * FROM erp_expenses WHERE id=?', [id]);
      if (!expRows.length) return res.status(404).json({ error: 'Expense not found' });
      const expense = expRows[0];

      await conn.query(
        'UPDATE erp_expenses SET status=?,admin_note=?,approved_by=?,approved_at=NOW() WHERE id=?',
        [status, admin_note||'', approved_by||null, id]
      );

      // If approved, create ledger credit entry for employee
      if (status === 'approved') {
        const [accounts]: any = await conn.query('SELECT id FROM erp_accounts WHERE reference_id=? AND type="employee"', [expense.employee_id]);
        let accountId: number;
        if (accounts.length) {
          accountId = accounts[0].id;
        } else {
          const [userRows]: any = await conn.query('SELECT name FROM erp_users WHERE id=?', [expense.employee_id]);
          const [newAcc]: any = await conn.query(
            'INSERT INTO erp_accounts (name,type,reference_id) VALUES (?,?,?)',
            [userRows[0]?.name || 'Employee', 'employee', expense.employee_id]
          );
          accountId = newAcc.insertId;
        }
        await conn.query(
          'INSERT INTO erp_transactions (account_id,type,amount,description,reference_type,reference_id,created_by) VALUES (?,?,?,?,?,?,?)',
          [accountId, 'credit', expense.amount, `Expense reimbursement: ${expense.description}`, 'expense', id, approved_by||null]
        );
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  } finally {
    if (conn) try { await conn.end(); } catch (_) {}
  }
}
