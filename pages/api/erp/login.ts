import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  let connection;
  try {
    const mysql = require('mysql2/promise');
    connection = await Promise.race([
      mysql.createConnection({ host: process.env.DB_HOST||'srv497.hstgr.io', user: process.env.DB_USER||'u992747032_firestick4uk', password: process.env.DB_PASSWORD||'Firestick@2026', database: process.env.DB_NAME||'u992747032_firestick4uk', port: 3306, connectTimeout: 5000 }),
      new Promise((_,reject) => setTimeout(()=>reject(new Error('timeout')),6000)),
    ]);

    // Auto-create all ERP tables
    await connection.query(`CREATE TABLE IF NOT EXISTS erp_users (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(255) UNIQUE NOT NULL, password VARCHAR(255) NOT NULL, role ENUM('admin','manager','employee') DEFAULT 'employee', department VARCHAR(100), salary DECIMAL(10,2) DEFAULT 0, joining_date DATE, active TINYINT(1) DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await connection.query(`CREATE TABLE IF NOT EXISTS erp_attendance (id INT AUTO_INCREMENT PRIMARY KEY, employee_id INT NOT NULL, date DATE NOT NULL, time_in DATETIME, time_out DATETIME, status ENUM('present','absent','late','half_day') DEFAULT 'present', working_hours DECIMAL(4,2))`);
    await connection.query(`CREATE TABLE IF NOT EXISTS erp_expenses (id INT AUTO_INCREMENT PRIMARY KEY, employee_id INT NOT NULL, amount DECIMAL(10,2) NOT NULL, description TEXT, category VARCHAR(100), receipt_path VARCHAR(500), status ENUM('pending','approved','rejected') DEFAULT 'pending', admin_note TEXT, approved_by INT, approved_at DATETIME, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await connection.query(`CREATE TABLE IF NOT EXISTS erp_accounts (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, type ENUM('employee','vendor','client') NOT NULL, reference_id INT, opening_balance DECIMAL(10,2) DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await connection.query(`CREATE TABLE IF NOT EXISTS erp_transactions (id INT AUTO_INCREMENT PRIMARY KEY, account_id INT NOT NULL, type ENUM('credit','debit') NOT NULL, amount DECIMAL(10,2) NOT NULL, description TEXT, reference_type VARCHAR(50), reference_id INT, created_by INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await connection.query(`CREATE TABLE IF NOT EXISTS erp_leaves (id INT AUTO_INCREMENT PRIMARY KEY, employee_id INT NOT NULL, leave_type ENUM('sick','annual','emergency','unpaid') DEFAULT 'annual', from_date DATE NOT NULL, to_date DATE NOT NULL, reason TEXT, status ENUM('pending','approved','rejected') DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await connection.query(`CREATE TABLE IF NOT EXISTS erp_audit_log (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, action VARCHAR(255), details TEXT, ip_address VARCHAR(50), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);

    // Add new columns to existing tables (ignore if already exist)
    for (const sql of [
      "ALTER TABLE erp_users ADD COLUMN monthly_expense_limit DECIMAL(10,2) DEFAULT 500",
      "ALTER TABLE erp_expenses ADD COLUMN month_year VARCHAR(7)",
    ]) { try { await connection.query(sql); } catch (_) {} }

    // Insert default admin if not exists
    const [existing]: any = await connection.query('SELECT id FROM erp_users WHERE email = ?', ['admin@firestick4uk.com']);
    if (!existing.length) {
      await connection.query(`INSERT INTO erp_users (name,email,password,role) VALUES ('Admin','admin@firestick4uk.com','erp123','admin')`);
    }

    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const [rows]: any = await connection.query('SELECT id,name,email,role,department FROM erp_users WHERE email=? AND password=? AND active=1', [email, password]);
    if (!rows.length) {
      await connection.query('INSERT INTO erp_audit_log (action,details,ip_address) VALUES (?,?,?)', ['LOGIN_FAILED', `Failed login for ${email}`, req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown']).catch(()=>{});
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    await connection.query('INSERT INTO erp_audit_log (user_id,action,details,ip_address) VALUES (?,?,?,?)', [rows[0].id,'LOGIN',`${rows[0].name} logged in`,req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown']).catch(()=>{});
    return res.status(200).json({ success: true, user: rows[0] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  } finally {
    if (connection) try { await connection.end(); } catch (_) {}
  }
}
