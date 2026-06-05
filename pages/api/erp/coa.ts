import pool from '../../../lib/db';
import type { NextApiRequest, NextApiResponse } from 'next';

const SEED: { name: string; type: string }[] = [
  { name: 'Cash In Hand',              type: 'asset'   },
  { name: 'Main Bank Account',         type: 'asset'   },
  { name: 'Office Rent Expense',       type: 'expense' },
  { name: 'Utility Bills',             type: 'expense' },
  { name: 'Online Subscriptions',      type: 'expense' },
  { name: 'Salary Expense',            type: 'expense' },
  { name: 'Building Maintenance',      type: 'expense' },
  { name: 'General Office Expense',    type: 'expense' },
  { name: 'IPTV Sales Revenue',        type: 'revenue' },
  { name: 'Corporate Service Revenue', type: 'revenue' },
];

async function bootstrap() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS erp_chart_of_accounts (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      account_name VARCHAR(100) NOT NULL,
      account_type ENUM('asset','liability','equity','revenue','expense') NOT NULL,
      code         VARCHAR(20) UNIQUE NULL,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const [cnt]: any = await pool.query('SELECT COUNT(*) as n FROM erp_chart_of_accounts');
  if (Number(cnt[0]?.n) === 0) {
    for (const s of SEED) {
      await pool.query(
        'INSERT IGNORE INTO erp_chart_of_accounts (account_name,account_type) VALUES (?,?)',
        [s.name, s.type]
      ).catch(() => {});
    }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await bootstrap();

    if (req.method === 'GET') {
      const { type } = req.query;
      const [rows] = type
        ? await pool.query('SELECT * FROM erp_chart_of_accounts WHERE account_type=? ORDER BY account_name', [type])
        : await pool.query('SELECT * FROM erp_chart_of_accounts ORDER BY account_type, account_name');
      return res.status(200).json(Array.isArray(rows) ? rows : []);
    }

    if (req.method === 'POST') {
      const { account_name, account_type, code } = req.body;
      if (!account_name || !account_type) return res.status(400).json({ error: 'Missing fields' });
      const [result]: any = await pool.query(
        'INSERT INTO erp_chart_of_accounts (account_name,account_type,code) VALUES (?,?,?)',
        [account_name, account_type, code || null]
      );
      return res.status(200).json({ success: true, id: result.insertId });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
