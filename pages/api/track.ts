import type { NextApiRequest, NextApiResponse } from 'next';
import pool from '../../lib/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { order_id } = req.query;
  if (!order_id) return res.status(400).json({ error: 'Order ID required' });

  try {
    const [rows]: any = await pool.query('SELECT * FROM orders WHERE order_id = ?', [order_id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const [items]: any = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [order_id]);
    return res.status(200).json({ order: rows[0], items });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
