import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'u992747032_firestick4uk',
  password: process.env.DB_PASSWORD || 'Firestick@2026',
  database: process.env.DB_NAME || 'u992747032_firestick4uk',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export default pool;