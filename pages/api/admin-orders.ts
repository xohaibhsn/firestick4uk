import type { NextApiRequest, NextApiResponse } from 'next';
import pool from '../../lib/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      if (req.query.customers === '1') {
        const [rows] = await pool.query(`
          SELECT customer_name, customer_email, customer_phone,
            COUNT(*) AS order_count,
            SUM(total) AS total_spent,
            MIN(created_at) AS first_order
          FROM orders
          GROUP BY customer_email, customer_name, customer_phone
          ORDER BY first_order DESC
        `);
        return res.status(200).json(Array.isArray(rows) ? rows : []);
      }
      const [rows] = await pool.query(`
        SELECT o.*,
          GROUP_CONCAT(oi.product_name ORDER BY oi.id SEPARATOR ' + ') AS items_list
        FROM orders o
        LEFT JOIN order_items oi ON o.order_id = oi.order_id
        GROUP BY o.order_id
        ORDER BY o.created_at DESC
      `);
      return res.status(200).json(Array.isArray(rows) ? rows : []);
    }

    if (req.method === 'PATCH') {
      const { order_id, status } = req.body;
      await pool.query('UPDATE orders SET status = ? WHERE order_id = ?', [status, order_id]);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
