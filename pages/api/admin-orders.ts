import type { NextApiRequest, NextApiResponse } from 'next';
import pool from '../../lib/db';

function checkAdminAuth(req: NextApiRequest): boolean {
  const session = req.headers['x-admin-session'] || req.cookies?.sAdminSession;
  return !!session;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
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

    if (req.method === 'DELETE') {
      const { order_id } = req.body;
      if (!order_id) return res.status(400).json({ error: 'order_id required' });

      // Fetch order before deleting (for response summary)
      const [orderRows]: any = await pool.query('SELECT * FROM orders WHERE order_id=?', [order_id]);
      if (!orderRows.length) return res.status(404).json({ error: 'Order not found' });
      const order = orderRows[0];

      // Delete order items first (FK constraint)
      await pool.query('DELETE FROM order_items WHERE order_id=?', [order_id]);
      // Delete main order
      await pool.query('DELETE FROM orders WHERE order_id=?', [order_id]);

      return res.status(200).json({
        success: true,
        deleted_order_id: order_id,
        reversed_amount: Number(order.total || 0),
        was_status: order.status,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
