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
      const [rows] = await connection.query('SELECT * FROM orders ORDER BY created_at DESC');
      return res.status(200).json(Array.isArray(rows) ? rows : []);
    }

    if (req.method === 'PATCH') {
      const { order_id, status } = req.body;
      await connection.query(
        'UPDATE orders SET status = ? WHERE order_id = ?',
        [status, order_id]
      );
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  } finally {
    if (connection) await connection.end();
  }
}