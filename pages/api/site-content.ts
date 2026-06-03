import type { NextApiRequest, NextApiResponse } from 'next';
import pool from '../../lib/db';

const DEFAULTS = [
  ['site_title','Firestick4UK','text','settings','Website Title'],
  ['site_tagline','Best Firestick Service in UK','text','settings','Website Tagline'],
  ['favicon_url','/favicon.ico','image','settings','Favicon URL'],
  ['home_hero_title','Best Firestick Service in UK','text','home','Hero Title'],
  ['home_hero_subtitle','Premium IPTV & Streaming Solutions for the UK','textarea','home','Hero Subtitle'],
  ['home_tagline','Fast. Reliable. Affordable.','text','home','Tagline'],
  ['about_title','About Firestick4UK','text','about','Page Title'],
  ['about_description','We started Firestick4UK with one goal — to make premium streaming devices and subscription plans accessible, affordable, and hassle-free for everyone in the UK.','textarea','about','Main Description'],
  ['about_mission','Our mission is to deliver the best streaming experience at fair prices, with real human support that actually helps.','textarea','about','Mission Statement'],
  ['contact_phone','+44 7934 519060','text','contact','Phone Number'],
  ['contact_email','support@firestick4uk.com','text','contact','Email Address'],
  ['contact_hours','9AM – 10PM, 7 days a week','text','contact','Business Hours'],
  ['contact_address','United Kingdom','text','contact','Address'],
  ['contact_whatsapp','447934519060','text','contact','WhatsApp Number'],
  ['footer_text','© 2026 Firestick4UK. All rights reserved.','textarea','footer','Footer Text'],
  ['footer_tagline','Premium Firestick Services UK','text','footer','Footer Tagline'],
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS site_content (
        id INT AUTO_INCREMENT PRIMARY KEY,
        content_key VARCHAR(100) UNIQUE NOT NULL,
        content_value TEXT,
        content_type ENUM('text','textarea','image','url') DEFAULT 'text',
        page_name VARCHAR(50),
        label VARCHAR(100),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    for (const [key, val, type, page, label] of DEFAULTS) {
      try {
        await pool.query(
          'INSERT IGNORE INTO site_content (content_key, content_value, content_type, page_name, label) VALUES (?,?,?,?,?)',
          [key, val, type, page, label]
        );
      } catch (_) {}
    }

    if (req.method === 'GET') {
      const { page } = req.query;
      let query = 'SELECT content_key, content_value, content_type, page_name, label FROM site_content';
      const params: any[] = [];
      if (page && page !== 'all') { query += ' WHERE page_name=?'; params.push(page); }
      query += ' ORDER BY id ASC';
      const [rows]: any = await pool.query(query, params);
      const result: Record<string,string> = {};
      for (const r of rows) result[r.content_key] = r.content_value || '';
      return res.status(200).json(result);
    }

    if (req.method === 'POST') {
      const { key, value, updates } = req.body;
      if (updates && Array.isArray(updates)) {
        for (const u of updates) {
          await pool.query('UPDATE site_content SET content_value=? WHERE content_key=?', [u.value||'', u.key]);
        }
      } else if (key) {
        await pool.query('UPDATE site_content SET content_value=? WHERE content_key=?', [value||'', key]);
      }
      return res.status(200).json({ success: true });
    }

    if (req.method === 'PUT') {
      const { content_key, content_value, content_type, page_name, label } = req.body;
      await pool.query(
        'INSERT INTO site_content (content_key,content_value,content_type,page_name,label) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE content_value=?,label=?',
        [content_key, content_value||'', content_type||'text', page_name||'', label||content_key, content_value||'', label||content_key]
      );
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const { key } = req.query;
      await pool.query('DELETE FROM site_content WHERE content_key=?', [key]);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
