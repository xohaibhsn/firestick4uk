import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  let connection;
  try {
    const mysql = require('mysql2/promise');

    const connectWithTimeout = Promise.race([
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

    connection = await connectWithTimeout;

    const [rows] = await connection.query(
      'SELECT * FROM products WHERE active = 1 ORDER BY id ASC'
    );

    return res.status(200).json(Array.isArray(rows) ? rows : []);
  } catch (error: any) {
    console.error('DB Error:', error.message);
    return res.status(200).json({ error: error.message });
  } finally {
    if (connection) try { await connection.end(); } catch (_) {}
  }
}