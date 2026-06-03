import mysql from 'mysql2/promise';

declare global {
  // eslint-disable-next-line no-var
  var _mysqlPool: mysql.Pool | undefined;
}

const poolConfig: mysql.PoolOptions = {
  host:            process.env.DB_HOST     || 'srv497.hstgr.io',
  user:            process.env.DB_USER     || 'u992747032_firestick4uk',
  password:        process.env.DB_PASSWORD || 'Firestick@2026',
  database:        process.env.DB_NAME     || 'u992747032_firestick4uk',
  port:            Number(process.env.DB_PORT) || 3306,
  connectionLimit: 3,
  waitForConnections: true,
  queueLimit:      5,
  connectTimeout:  8000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
};

// In dev, reuse pool across hot-reloads to prevent connection leaks
const pool = global._mysqlPool ?? mysql.createPool(poolConfig);
if (process.env.NODE_ENV !== 'production') global._mysqlPool = pool;

export default pool;
