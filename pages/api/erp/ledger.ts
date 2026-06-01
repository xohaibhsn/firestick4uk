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
      const { account_id } = req.query;

      if (account_id) {
        const [txns] = await conn.query(
          'SELECT * FROM erp_transactions WHERE account_id=? ORDER BY created_at DESC',
          [account_id]
        );
        const [bal]: any = await conn.query(
          'SELECT COALESCE(SUM(CASE WHEN type="credit" THEN amount ELSE -amount END),0) as balance FROM erp_transactions WHERE account_id=?',
          [account_id]
        );
        const [acc]: any = await conn.query('SELECT * FROM erp_accounts WHERE id=?', [account_id]);
        const openingBalance = acc[0]?.opening_balance || 0;
        return res.status(200).json({ transactions: Array.isArray(txns)?txns:[], balance: Number(openingBalance) + Number(bal[0]?.balance || 0) });
      }

      const [accounts] = await conn.query(`
        SELECT a.*,
          COALESCE(a.opening_balance,0) + COALESCE(SUM(CASE WHEN t.type='credit' THEN t.amount WHEN t.type='debit' THEN -t.amount ELSE 0 END),0) as balance
        FROM erp_accounts a
        LEFT JOIN erp_transactions t ON a.id=t.account_id
        GROUP BY a.id
        ORDER BY a.name
      `);
      return res.status(200).json(Array.isArray(accounts)?accounts:[]);
    }

    if (req.method === 'POST') {
      const { account_id, type, amount, description, created_by } = req.body;
      if (!account_id || !type || !amount) return res.status(400).json({ error: 'Missing fields' });
      const [result]: any = await conn.query(
        'INSERT INTO erp_transactions (account_id,type,amount,description,created_by) VALUES (?,?,?,?,?)',
        [account_id, type, amount, description||'', created_by||null]
      );
      return res.status(200).json({ success: true, id: result.insertId });
    }

    // Add new account
    if (req.method === 'PUT') {
      const { name, type, opening_balance } = req.body;
      if (!name || !type) return res.status(400).json({ error: 'Missing fields' });
      const [result]: any = await conn.query(
        'INSERT INTO erp_accounts (name,type,opening_balance) VALUES (?,?,?)',
        [name, type, opening_balance||0]
      );
      return res.status(200).json({ success: true, id: result.insertId });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  } finally {
    if (conn) try { await conn.end(); } catch (_) {}
  }
}
