import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let connection;
  try {
    const mysql = require('mysql2/promise');
    connection = await Promise.race([
      mysql.createConnection({
        host: process.env.DB_HOST || 'srv497.hstgr.io',
        user: process.env.DB_USER || 'u992747032_firestick4uk',
        password: process.env.DB_PASSWORD || 'Firestick@2026',
        database: process.env.DB_NAME || 'u992747032_firestick4uk',
        port: Number(process.env.DB_PORT) || 3306,
        connectTimeout: 5000,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB connection timeout')), 6000)),
    ]);

    if (req.method === 'POST') {
      const { customer_name, customer_email, customer_phone, delivery_address, city, postcode, notes, payment_method, receipt_path, items, total } = req.body;

      const order_id = 'ORD-' + Date.now();

      await connection.query(
        'INSERT INTO orders (order_id, customer_name, customer_email, customer_phone, delivery_address, city, postcode, notes, payment_method, receipt_path, total, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [order_id, customer_name, customer_email, customer_phone, delivery_address, city, postcode, notes || '', payment_method, receipt_path || '', total, 'pending']
      );

      for (const item of items) {
        await connection.query(
          'INSERT INTO order_items (order_id, product_id, product_name, price, quantity) VALUES (?, ?, ?, ?, ?)',
          [order_id, item.id, item.name, item.price, item.qty]
        );
      }

      return res.status(200).json({ success: true, order_id });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  } finally {
    if (connection) try { await connection.end(); } catch (_) {}
  }
}