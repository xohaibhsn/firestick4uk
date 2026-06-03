import type { NextApiRequest, NextApiResponse } from 'next';

const getDB = async () => {
  const mysql = require('mysql2/promise');
  return Promise.race([
    mysql.createConnection({ host: process.env.DB_HOST||'srv497.hstgr.io', user: process.env.DB_USER||'u992747032_firestick4uk', password: process.env.DB_PASSWORD||'Firestick@2026', database: process.env.DB_NAME||'u992747032_firestick4uk', port: 3306, connectTimeout: 5000 }),
    new Promise((_,reject) => setTimeout(()=>reject(new Error('timeout')),6000)),
  ]);
};

const DEFAULTS = [
  ['home_hero','{"title":"Best Firestick Service in UK","subtitle":"Premium IPTV & Streaming Solutions","button_text":"Shop Now","button_link":"/products","secondary_button_text":"Learn More","secondary_button_link":"/about"}','json','home','Hero Section',1,1],
  ['home_featured_products','{"title":"Our Products","subtitle":"Premium streaming solutions for every need","show_count":6}','json','home','Featured Products Section',2,1],
  ['home_features','{"title":"Why Choose Us","items":[{"icon":"⚡","title":"Fast Setup","description":"Ready in minutes"},{"icon":"🔒","title":"Secure","description":"Safe & reliable"},{"icon":"💬","title":"24/7 Support","description":"Always here for you"},{"icon":"🚀","title":"Fast Delivery","description":"Quick & efficient"}]}','json','home','Features Section',3,1],
  ['home_testimonials','{"title":"What Our Customers Say","items":[{"name":"John Smith","rating":5,"text":"Amazing service! Got my Firestick set up in minutes."},{"name":"Sarah Jones","rating":5,"text":"Best firestick service in UK! Great value."}]}','json','home','Testimonials Section',4,1],
  ['home_newsletter','{"title":"Stay in the Loop","subtitle":"Get the latest guides, tips and offers delivered to your inbox","button_text":"Subscribe"}','json','home','Newsletter Section',5,1],
  ['about_hero','{"title":"About Firestick4UK","subtitle":"Your trusted streaming partner in the UK"}','json','about','Hero Section',1,1],
  ['about_mission','{"title":"Our Mission","text":"We provide premium firestick services to make streaming accessible for everyone in the UK. Founded by tech enthusiasts, we believe in fair prices and real human support."}','json','about','Mission Section',2,1],
  ['about_values','{"title":"Our Values","items":[{"icon":"🎯","title":"Quality","description":"Best in class service every time"},{"icon":"❤️","title":"Trust","description":"Transparent & honest always"},{"icon":"🚀","title":"Speed","description":"Fast delivery & setup"}]}','json','about','Values Section',3,1],
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let conn: any;
  try {
    conn = await getDB();

    // Auto-migrate
    for (const col of [
      "ALTER TABLE site_content ADD COLUMN section_order INT DEFAULT 0",
      "ALTER TABLE site_content ADD COLUMN is_visible TINYINT(1) DEFAULT 1",
    ]) { try { await conn.query(col); } catch (_) {} }

    // Insert defaults
    for (const [key,val,type,page,label,order,vis] of DEFAULTS) {
      try {
        await conn.query(
          'INSERT IGNORE INTO site_content (content_key,content_value,content_type,page_name,label,section_order,is_visible) VALUES (?,?,?,?,?,?,?)',
          [key,val,type,page,label,order,vis]
        );
      } catch (_) {}
    }

    if (req.method === 'GET') {
      const { page, all } = req.query;
      let query = 'SELECT content_key,content_value,content_type,page_name,label,section_order,is_visible FROM site_content WHERE page_name=? AND content_type="json"';
      const params: any[] = [page || 'home'];
      if (!all) query += ' AND is_visible=1';
      query += ' ORDER BY section_order ASC';
      const [rows]: any = await conn.query(query, params);
      const result = (Array.isArray(rows)?rows:[]).map((r:any) => ({
        key: r.content_key,
        label: r.label,
        page: r.page_name,
        order: r.section_order,
        visible: !!r.is_visible,
        data: (() => { try { return JSON.parse(r.content_value); } catch { return {}; } })(),
      }));
      return res.status(200).json(result);
    }

    if (req.method === 'POST') {
      const { key, value } = req.body;
      if (!key) return res.status(400).json({ error: 'Key required' });
      const json = typeof value === 'string' ? value : JSON.stringify(value);
      await conn.query('UPDATE site_content SET content_value=? WHERE content_key=?', [json, key]);
      return res.status(200).json({ success: true });
    }

    if (req.method === 'PUT') {
      const { action } = req.query;
      if (action === 'visibility') {
        const { key, is_visible } = req.body;
        await conn.query('UPDATE site_content SET is_visible=? WHERE content_key=?', [is_visible?1:0, key]);
        return res.status(200).json({ success: true });
      }
      if (action === 'reorder') {
        const { order } = req.body;
        for (const item of (order||[])) {
          await conn.query('UPDATE site_content SET section_order=? WHERE content_key=?', [item.section_order, item.key]);
        }
        return res.status(200).json({ success: true });
      }
      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  } finally {
    if (conn) try { await conn.end(); } catch (_) {}
  }
}
