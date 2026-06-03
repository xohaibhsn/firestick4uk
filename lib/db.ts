import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host:            process.env.DB_HOST     || 'srv497.hstgr.io',
  user:            process.env.DB_USER     || 'u992747032_firestick4uk',
  password:        process.env.DB_PASSWORD || 'Firestick@2026',
  database:        process.env.DB_NAME     || 'u992747032_firestick4uk',
  port:            3306,
  connectionLimit: 5,
  waitForConnections: true,
  queueLimit:      10,
  connectTimeout:  8000,
  idleTimeout:     60000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

export default pool;
