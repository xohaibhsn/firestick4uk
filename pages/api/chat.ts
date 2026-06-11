import type { NextApiRequest, NextApiResponse } from 'next';
import Anthropic from '@anthropic-ai/sdk';
import nodemailer from 'nodemailer';
import pool from '@/lib/db';
import { RL_GENERAL, getClientIp } from '@/lib/rateLimit';

const SYSTEM_PROMPT = `Your name is Berlin. You are a friendly sales and support assistant for Firestick4UK (firestick4uk.com) — a UK-based streaming service.

PRODUCTS & PRICING:
- 1 Month: £12
- 3 Months: £20
- 6 Months: £30
- 1 Year: £50
- 2 Years: £70
- 4 Years: £100
- Lifetime: £140
All plans include HD & 4K channels, Live Sports, Movies, Series, Catch-up TV.

PAYMENT:
- Chase Bank: Robert George Bennett, Sort 60-84-07, Acc 70745518
- Revolut: revolut.me/robertalu6
- Reference: Customer first name only
- No PayPal. No COD.

DELIVERY:
- All digital. Active within 1 hour of payment.

DEVICES & APPS:
- Firestick 1st gen / Android box: A1 IPTV Player — Downloader code 8244908
- Firestick 2nd gen: XCIPTV — code 649789
- Firestick 3rd gen: IBO Player Pro (Amazon)
- Samsung/LG Smart TV: IBO Player Pro (TV Store)
- iPhone: IBO Player Pro or NEXT+ Player
- Roku: IBO Player (Roku Store)
- Android phone/tablet: firestick4uk.com/downloads/A1IPTVPlayer-latest.apk
- Server URL: http://sticktv4k.com:80/ (HTTP only!)

POLICIES:
- No free trials
- 7-day money back on 1 Year and above only
- One connection per subscription
- Outside UK: available but no guarantee
- ISP blocking: use VPN or mobile hotspot

CONTACT:
- WhatsApp: +447934519060
- Telegram: @firestick44

BEHAVIOUR RULES:
- Friendly British English
- Introduce yourself as Berlin
- Always ask what device customer is using
- Never share reseller pricing
- Collect name + WhatsApp BEFORE sharing payment details
- Say: 'Before I share payment details, could I get your name and WhatsApp number so we can confirm your order?'
- Recommend 1 Year plan for unsure customers
- Complex issues → WhatsApp: +447934519060

LEAD CAPTURE:
- Once you have customer name + WhatsApp: add [LEAD_CAPTURED:name:number:interest] at END of your response
- Example: [LEAD_CAPTURED:John:07911234567:1 Year]`;

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

async function ensureChatLeadsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_leads (
      id INT AUTO_INCREMENT PRIMARY KEY,
      customer_name VARCHAR(255),
      customer_whatsapp VARCHAR(50),
      customer_email VARCHAR(255),
      interested_in VARCHAR(255),
      chat_history TEXT,
      ip_address VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function normaliseHistory(history: unknown): ChatMessage[] {
  if (!Array.isArray(history)) return [];

  return history
    .map((item) => {
      const candidate = item as { role?: unknown; content?: unknown };
      return {
        role: candidate.role === 'assistant' ? 'assistant' : candidate.role === 'user' ? 'user' : null,
        content: typeof candidate.content === 'string' ? candidate.content.trim() : '',
      };
    })
    .filter((item): item is ChatMessage => !!item.role && item.content.length > 0)
    .slice(-20);
}

function extractText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      const candidate = part as { type?: unknown; text?: unknown };
      return candidate.type === 'text' && typeof candidate.text === 'string' ? candidate.text : '';
    })
    .join('\n')
    .trim();
}

function extractLead(responseText: string) {
  const match = responseText.match(/\s*\[LEAD_CAPTURED:([^:\]]+):([^:\]]+):([^\]]*)\]\s*$/);
  if (!match) return null;

  return {
    name: match[1].trim(),
    whatsapp: match[2].trim(),
    interest: match[3].trim() || 'Not specified',
    cleanResponse: responseText.replace(match[0], '').trim(),
  };
}

async function sendLeadEmail(params: {
  name: string;
  whatsapp: string;
  interest: string;
  timestamp: string;
  chatHistory: string;
}) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;

  const transporter = nodemailer.createTransport({
    host: 'smtp.hostinger.com',
    port: 465,
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporter.sendMail({
    from: '"Berlin | Firestick4UK" <noreply@firestick4uk.com>',
    to: 'firestick4uk@gmail.com',
    subject: `🔔 New Lead — ${params.name} | Firestick4UK`,
    text: `Hi Hassan,

New lead from Berlin Chat!

👤 Name: ${params.name}
📱 WhatsApp: ${params.whatsapp}
💡 Interested in: ${params.interest}
🕐 Time: ${params.timestamp}

Chat History:
${params.chatHistory}

— Berlin | firestick4uk.com`,
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { allowed } = RL_GENERAL(getClientIp(req));
  if (!allowed) return res.status(429).json({ error: 'Too many requests' });

  try {
    await ensureChatLeadsTable();

    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) return res.status(400).json({ error: 'Message is required' });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Chat is not configured' });

    const history = normaliseHistory(req.body?.history);
    const messages: ChatMessage[] = [...history, { role: 'user', content: message }];

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const completion = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages,
    });

    const rawReply = extractText(completion.content);
    const lead = extractLead(rawReply);
    const cleanReply = lead?.cleanResponse || rawReply;
    const fullChatHistory = [...messages, { role: 'assistant' as const, content: cleanReply }]
      .map((m) => `${m.role === 'user' ? 'Customer' : 'Berlin'}: ${m.content}`)
      .join('\n\n');

    const timestamp = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' });
    const leadName = lead?.name || 'Website visitor';
    const leadWhatsapp = lead?.whatsapp || 'Not provided';
    const leadInterest = lead?.interest || 'General chat enquiry';

    await pool.query(
      'INSERT INTO chat_leads (customer_name, customer_whatsapp, customer_email, interested_in, chat_history, ip_address) VALUES (?,?,?,?,?,?)',
      [leadName, leadWhatsapp, null, leadInterest, fullChatHistory, getClientIp(req)]
    );
    await sendLeadEmail({
      name: leadName,
      whatsapp: leadWhatsapp,
      interest: leadInterest,
      timestamp,
      chatHistory: fullChatHistory,
    }).catch((err: unknown) => console.error('[chat] Lead email failed:', err));

    return res.status(200).json({ response: cleanReply });
  } catch (error: unknown) {
    console.error('[chat] API error:', error);
    return res.status(500).json({ error: 'Chat request failed' });
  }
}
