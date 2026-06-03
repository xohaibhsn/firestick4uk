import type { NextApiRequest, NextApiResponse } from 'next';

const getDB = async () => {
  const mysql = require('mysql2/promise');
  return Promise.race([
    mysql.createConnection({ host: process.env.DB_HOST||'srv497.hstgr.io', user: process.env.DB_USER||'u992747032_firestick4uk', password: process.env.DB_PASSWORD||'Firestick@2026', database: process.env.DB_NAME||'u992747032_firestick4uk', port: 3306, connectTimeout: 5000 }),
    new Promise((_,reject) => setTimeout(()=>reject(new Error('timeout')),6000)),
  ]);
};

const DEFAULT_FAQS = [
  ['How do I place an order?','Browse our products, add items to your cart, fill in your delivery details, choose your payment method (bank transfer or cash on delivery), and click Place Order. You\'ll receive an Order ID instantly.','Orders & Payment',1],
  ['What payment methods do you accept?','We accept UK bank transfer and cash on delivery. For bank transfer, our account details are shown at checkout. Simply transfer the amount and upload your receipt — we verify it manually within a few hours.','Orders & Payment',2],
  ['How do I pay by bank transfer?','At checkout, select Bank Transfer. Our UK bank account details will be displayed. Transfer the exact amount using the Order ID as your reference, then upload a screenshot of your receipt. We\'ll verify and confirm your order shortly.','Orders & Payment',3],
  ['Is cash on delivery available?','Yes! Cash on delivery is available for physical products (Firestick and Android Boxes) delivered across the UK. Simply select this option at checkout.','Orders & Payment',4],
  ['Can I cancel my order?','You can cancel your order before it has been dispatched. Please contact us via WhatsApp with your Order ID as soon as possible. Once dispatched, cancellations are not possible but you may be eligible for a return.','Orders & Payment',5],
  ['How long does delivery take?','Physical items (Firestick and Android Boxes) are delivered within 2-3 working days across the UK. Subscription plans are activated digitally within a few hours of payment verification.','Delivery & Shipping',1],
  ['Do you deliver across the whole UK?','Yes, we deliver to all mainland UK addresses. For remote locations such as Scottish Highlands or islands, delivery may take an extra 1-2 days.','Delivery & Shipping',2],
  ['How much does shipping cost?','Shipping is free on subscription plans. For physical products, a standard shipping fee of £3.99 applies unless otherwise stated at checkout.','Delivery & Shipping',3],
  ['How do I track my order?','Once your order is confirmed, use your Order ID on our Order Tracking page to check real-time status — from confirmation through to delivery.','Delivery & Shipping',4],
  ['Do Firesticks come pre-configured?','Yes! Our Firestick devices are pre-configured and ready to use straight out of the box. Simply plug in, connect to your Wi-Fi, and you\'re good to go.','Products & Setup',1],
  ['What is a subscription plan?','Our subscription plans give you access to premium content through compatible apps on your device. Plans are available monthly, 6-monthly, and yearly.','Products & Setup',2],
  ['Which devices are compatible with the subscription plans?','Our plans are compatible with Firestick, Android Boxes, Smart TVs, phones, tablets, and most other streaming devices.','Products & Setup',3],
  ['What if my device stops working?','Please contact us via WhatsApp with your Order ID and a description of the issue. We\'ll do our best to help resolve it quickly.','Products & Setup',4],
  ['What is your refund policy?','We offer refunds on physical products within 14 days of delivery, provided the item is unused and in its original packaging. Subscription plans are non-refundable once activated. See our full Refund Policy for details.','Returns & Refunds',1],
  ['How do I return an item?','Contact us via WhatsApp or email with your Order ID and reason for return. We\'ll guide you through the process. Return postage costs are the responsibility of the customer unless the item is faulty.','Returns & Refunds',2],
  ['What if I received a faulty item?','We\'re sorry to hear that! Please contact us immediately via WhatsApp with photos of the fault. We\'ll arrange a replacement or full refund at no extra cost to you.','Returns & Refunds',3],
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let conn: any;
  try {
    conn = await getDB();

    await conn.query(`
      CREATE TABLE IF NOT EXISTS faqs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        category VARCHAR(100) DEFAULT 'General',
        sort_order INT DEFAULT 0,
        is_visible TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert defaults if empty
    const [count]: any = await conn.query('SELECT COUNT(*) as c FROM faqs');
    if (Number(count[0]?.c || 0) === 0) {
      for (const [q,a,cat,ord] of DEFAULT_FAQS) {
        await conn.query('INSERT INTO faqs (question,answer,category,sort_order) VALUES (?,?,?,?)', [q,a,cat,ord]);
      }
    }

    if (req.method === 'GET') {
      const { admin } = req.query;
      let query = 'SELECT * FROM faqs';
      if (!admin) query += ' WHERE is_visible=1';
      query += ' ORDER BY category, sort_order ASC';
      const [rows] = await conn.query(query);
      return res.status(200).json(Array.isArray(rows)?rows:[]);
    }

    if (req.method === 'POST') {
      const { question, answer, category, sort_order } = req.body;
      if (!question || !answer) return res.status(400).json({ error: 'Question and answer required' });
      const [r]: any = await conn.query(
        'INSERT INTO faqs (question,answer,category,sort_order) VALUES (?,?,?,?)',
        [question, answer, category||'General', sort_order||0]
      );
      return res.status(200).json({ success:true, id:r.insertId });
    }

    if (req.method === 'PUT') {
      const { id, question, answer, category, sort_order, is_visible } = req.body;
      if (!id) return res.status(400).json({ error: 'ID required' });
      await conn.query(
        'UPDATE faqs SET question=?,answer=?,category=?,sort_order=?,is_visible=? WHERE id=?',
        [question, answer, category||'General', sort_order||0, is_visible??1, id]
      );
      return res.status(200).json({ success:true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      await conn.query('DELETE FROM faqs WHERE id=?', [id]);
      return res.status(200).json({ success:true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  } finally {
    if (conn) try { await conn.end(); } catch (_) {}
  }
}
