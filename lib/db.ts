import mysql from 'mysql2/promise';

declare global {
  // eslint-disable-next-line no-var
  var _mysqlPool: mysql.Pool | undefined;
}

// Fail loudly if DB env vars are missing — never use hardcoded fallbacks
if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_NAME) {
  throw new Error(
    'CRITICAL: Missing required DB environment variables. ' +
    'Set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME in .env.local'
  );
}

const poolConfig: mysql.PoolOptions = {
  host:            process.env.DB_HOST,
  user:            process.env.DB_USER,
  password:        process.env.DB_PASSWORD,
  database:        process.env.DB_NAME,
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
