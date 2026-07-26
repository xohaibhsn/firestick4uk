import type { NextApiRequest, NextApiResponse } from 'next';
import pool from '../../lib/db';

function checkAdminAuth(req: any): boolean {
  const session = req.headers['x-admin-session'] || req.cookies?.sAdminSession;
  return !!session;
}



const DEFAULTS = [
  ['site_title','Firestick4UK','text','settings','Website Title'],
  ['site_tagline','Best Firestick Service in UK','text','settings','Website Tagline'],
  ['site_logo_url','','image','settings','Site Logo'],
  ['favicon_url','/favicon.ico','image','settings','Favicon URL'],
  ['og_default_image','','image','settings','Default OG Share Image'],
  ['home_top_hero_title','Best Firestick Service in UK','text','home','Top Hero Title'],
  ['home_top_hero_subtitle','Premium Streaming Solutions for the UK','textarea','home','Top Hero Subtitle'],
  ['home_hero_title','Premium UK Streaming Service','text','home','Main Hero Title'],
  ['home_hero_subtitle','Firestick4UK provides premium UK streaming services for Firestick and Android Box users.','textarea','home','Main Hero Subtitle'],
  ['home_tagline','Fast. Reliable. Affordable.','text','home','Tagline'],
  ['home_meta_title','Firestick4UK — Best Streaming Service UK','text','home','Meta Title'],
  ['home_meta_description','Premium Firestick subscriptions and streaming services in the UK. HD & 4K channels, live sports, movies and more.','textarea','home','Meta Description'],
  ['about_title','About Firestick4UK','text','about','Page Title'],
  ['about_description','We started Firestick4UK with one goal — to make premium streaming devices and subscription plans accessible, affordable, and hassle-free for everyone in the UK.','textarea','about','Main Description'],
  ['about_mission','Our mission is to deliver the best streaming experience at fair prices, with real human support that actually helps.','textarea','about','Mission Statement'],
  ['contact_phone','+44 7934 519060','text','contact','Phone Number'],
  ['contact_email','firestick4uk@gmail.com','text','contact','Email Address'],
  ['contact_hours','9AM – 10PM, 7 days a week','text','contact','Business Hours'],
  ['contact_address','United Kingdom','text','contact','Address'],
  ['contact_whatsapp','447934519060','text','contact','WhatsApp Number'],
  ['footer_text','© 2026 Firestick4UK. All rights reserved.','textarea','footer','Footer Text'],
  ['footer_tagline','Premium Firestick Services UK','text','footer','Footer Tagline'],
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET' && !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });

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

    // Migrate old email addresses to new one
    try {
      await pool.query(
        "UPDATE site_content SET content_value='firestick4uk@gmail.com' WHERE content_key='contact_email' AND content_value LIKE '%@firestick4uk.com%'"
      );
    } catch (_) {}

    // Replace public IPTV wording with Streaming
    for (const [from, to] of [
      ['Premium IPTV & Streaming', 'Premium Streaming'],
      ['IPTV & Streaming Solutions', 'Streaming Solutions'],
      ['Premium IPTV', 'Premium Streaming'],
      ['IPTV', 'Streaming'],
      ['iptv', 'streaming'],
    ] as const) {
      try {
        await pool.query(
          'UPDATE site_content SET content_value = REPLACE(content_value, ?, ?) WHERE content_value LIKE ?',
          [from, to, `%${from}%`]
        );
      } catch (_) {}
    }

    // Keep labels in sync for new/renamed home fields
    try {
      await pool.query(`UPDATE site_content SET label='Top Hero Title' WHERE content_key='home_top_hero_title'`);
      await pool.query(`UPDATE site_content SET label='Top Hero Subtitle' WHERE content_key='home_top_hero_subtitle'`);
      await pool.query(`UPDATE site_content SET label='Main Hero Title' WHERE content_key='home_hero_title'`);
      await pool.query(`UPDATE site_content SET label='Main Hero Subtitle' WHERE content_key='home_hero_subtitle'`);
    } catch (_) {}

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

      const upsert = async (contentKey: string, contentValue: string) => {
        const defaults = DEFAULTS.find((d) => d[0] === contentKey);
        const contentType = (defaults?.[2] as string) || 'text';
        const pageName = (defaults?.[3] as string) || (contentKey.split('_')[0] || 'home');
        const label = (defaults?.[4] as string) || contentKey;
        await pool.query(
          `INSERT INTO site_content (content_key, content_value, content_type, page_name, label)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE content_value = VALUES(content_value), page_name = VALUES(page_name), label = VALUES(label)`,
          [contentKey, contentValue || '', contentType, pageName, label]
        );
      };

      if (updates && Array.isArray(updates)) {
        for (const u of updates) {
          if (!u?.key) continue;
          await upsert(String(u.key), String(u.value ?? ''));
        }
      } else if (key) {
        await upsert(String(key), String(value ?? ''));
      } else {
        return res.status(400).json({ error: 'No content keys provided' });
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
