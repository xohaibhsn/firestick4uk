import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let connection;
  try {
    const mysql = require('mysql2/promise');
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'srv497.hstgr.io',
      user: process.env.DB_USER || 'u992747032_firestick4uk',
      password: process.env.DB_PASSWORD || 'Firestick@2026',
      database: process.env.DB_NAME || 'u992747032_firestick4uk',
      port: Number(process.env.DB_PORT) || 3306,
      connectTimeout: 10000,
    });

    if (req.method === 'GET') {
      const { order_id } = req.query;

      if (!order_id) {
        return res.status(400).json({ error: 'Order ID required' });
      }

      const [rows]: any = await connection.query(
        'SELECT * FROM orders WHERE order_id = ?',
        [order_id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const [items]: any = await connection.query(
        'SELECT * FROM order_items WHERE order_id = ?',
        [order_id]
      );

      return res.status(200).json({ order: rows[0], items });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  } finally {
    if (connection) await connection.end();
  }
}