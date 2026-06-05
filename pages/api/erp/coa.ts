import pool from '../../../lib/db';
import type { NextApiRequest, NextApiResponse } from 'next';

const SEED: { name: string; type: string }[] = [
  { name: 'Cash In Hand',                type: 'asset'     },
  { name: 'Main Bank Account',           type: 'asset'     },
  { name: 'Office Rent Expense',         type: 'expense'   },
  { name: 'Utility Bills',               type: 'expense'   },
  { name: 'Online Subscriptions',        type: 'expense'   },
  { name: 'Salary Expense',              type: 'expense'   },
  { name: 'Building Maintenance',        type: 'expense'   },
  { name: 'General Office Expense',      type: 'expense'   },
  { name: 'IPTV Sales Revenue',          type: 'revenue'   },
  { name: 'Corporate Service Revenue',   type: 'revenue'   },
  { name: 'Zohaib Hassan Loan Account',  type: 'liability' },
  { name: 'IPTV Manual Sales Revenue',   type: 'revenue'   },
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
  // Ensure critical accounts always exist (idempotent — handles pre-existing installations)
  const CRITICAL = [
    { name: 'Zohaib Hassan Loan Account', type: 'liability' },
    { name: 'IPTV Manual Sales Revenue',  type: 'revenue'   },
  ];
  for (const c of CRITICAL) {
    const [chk]: any = await pool.query(
      'SELECT id FROM erp_chart_of_accounts WHERE account_name=? LIMIT 1', [c.name]
    );
    if (!Array.isArray(chk) || !chk.length) {
      await pool.query(
        'INSERT INTO erp_chart_of_accounts (account_name,account_type) VALUES (?,?)', [c.name, c.type]
      ).catch(() => {});
    }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await bootstrap();

    if (req.method === 'GET') {
      const { type, balances, pnl } = req.query;

      // Account balances with correct normal-balance sign per account type
      if (balances) {
        const acctType = String(type || 'asset');
        // Assets increase on debit; Liabilities/Revenue/Equity increase on credit
        const drFactor = acctType === 'asset' ? 1 : -1;
        const crFactor = acctType === 'asset' ? -1 : 1;
        const [rows]: any = await pool.query(`
          SELECT c.id, c.account_name, c.account_type,
            COALESCE(a.opening_balance, 0) + COALESCE(
              SUM(CASE WHEN t.type='debit' THEN t.amount * ? WHEN t.type='credit' THEN t.amount * ? ELSE 0 END), 0
            ) AS balance
          FROM erp_chart_of_accounts c
          LEFT JOIN erp_accounts a ON a.name = c.account_name AND a.type = 'company'
          LEFT JOIN erp_transactions t ON t.coa_id = c.id
          WHERE c.account_type = ?
          GROUP BY c.id, c.account_name, c.account_type, a.opening_balance
          ORDER BY c.account_name
        `, [drFactor, crFactor, acctType]);
        return res.status(200).json(Array.isArray(rows) ? rows : []);
      }

      // Profit & Loss: revenue credits vs expense debits
      if (pnl) {
        const [revRows]: any = await pool.query(`
          SELECT c.id, c.account_name, COALESCE(SUM(t.amount), 0) AS total
          FROM erp_chart_of_accounts c
          LEFT JOIN erp_transactions t ON t.coa_id = c.id AND t.type = 'credit'
          WHERE c.account_type = 'revenue'
          GROUP BY c.id, c.account_name ORDER BY total DESC
        `);
        const [expRows]: any = await pool.query(`
          SELECT c.id, c.account_name, COALESCE(SUM(t.amount), 0) AS total
          FROM erp_chart_of_accounts c
          LEFT JOIN erp_transactions t ON t.coa_id = c.id AND t.type = 'debit'
          WHERE c.account_type = 'expense'
          GROUP BY c.id, c.account_name ORDER BY total DESC
        `);
        const revenues = Array.isArray(revRows) ? revRows : [];
        const expenses = Array.isArray(expRows) ? expRows : [];
        const totalRevenue  = revenues.reduce((s: number, r: any) => s + Number(r.total || 0), 0);
        const totalExpenses = expenses.reduce((s: number, e: any) => s + Number(e.total || 0), 0);
        return res.status(200).json({ revenues, expenses, totalRevenue, totalExpenses, netProfit: totalRevenue - totalExpenses });
      }

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
