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

    if (req.method === 'GET') {
      const [rows] = await connection.query('SELECT * FROM products ORDER BY created_at DESC');
      return res.status(200).json(Array.isArray(rows) ? rows : []);
    }

    if (req.method === 'POST') {
      const { name, description, price, category, badge, image, stock } = req.body;
      const [result]: any = await connection.query(
        'INSERT INTO products (name, description, price, category, badge, image, stock, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
        [name, description, price, category, badge || null, image || null, stock || 'Digital']
      );
      return res.status(200).json({ success: true, id: result.insertId });
    }

    if (req.method === 'PUT') {
      const { id, name, description, price, category, badge, image, stock, active } = req.body;
      await connection.query(
        'UPDATE products SET name=?, description=?, price=?, category=?, badge=?, image=?, stock=?, active=? WHERE id=?',
        [name, description, price, category, badge || null, image || null, stock, active, id]
      );
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      await connection.query('DELETE FROM products WHERE id = ?', [id]);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error: any) {
    console.error('DB Error:', error.message);
    return res.status(500).json({ error: error.message });
  } finally {
    if (connection) await connection.end();
  }
}