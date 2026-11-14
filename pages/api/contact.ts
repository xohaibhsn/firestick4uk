import type { NextApiRequest, NextApiResponse } from 'next';
import pool from '../../lib/db';
import { getClientIp, rateLimit } from '../../lib/rateLimit';

/** 5 messages / minute / IP */
const RL_CONTACT_MIN = (ip: string) => rateLimit(`contact:min:${ip}`, 5, 60 * 1000);
/** 30 messages / 24h / IP */
const RL_CONTACT_DAY = (ip: string) => rateLimit(`contact:day:${ip}`, 30, 24 * 60 * 60 * 1000);

const RATE_LIMITED = { error: 'Too many messages. Please try again later.' } as const;
const SEND_FAILED = { error: 'Message could not be sent. Please try again.' } as const;
const MISSING = { error: 'Missing required fields' } as const;
const INVALID = { error: 'Invalid form data' } as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asString(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = getClientIp(req);
  const min = RL_CONTACT_MIN(ip);
  if (!min.allowed) {
    res.setHeader('Retry-After', String(min.retryAfterSec));
    return res.status(429).json(RATE_LIMITED);
  }
  const day = RL_CONTACT_DAY(ip);
  if (!day.allowed) {
    res.setHeader('Retry-After', String(day.retryAfterSec));
    return res.status(429).json(RATE_LIMITED);
  }

  try {
    const body = (req.body || {}) as Record<string, unknown>;
    // Honeypot — silent success, no store / no email. Checked after rate limit.
    const honeypot = asString(body.website);
    if (honeypot) {
      console.log('[contact] honeypot');
      return res.status(200).json({ success: true });
    }

    const name = asString(body.name);
    const email = asString(body.email);
    const phone = asString(body.phone);
    const subject = asString(body.subject);
    const message = asString(body.message);

    if (!name || !email || !message) {
      return res.status(400).json(MISSING);
    }

    if (
      name.length > 100 ||
      email.length > 254 ||
      !EMAIL_RE.test(email) ||
      phone.length > 30 ||
      subject.length > 150 ||
      message.length < 1 ||
      message.length > 5000
    ) {
      return res.status(400).json(INVALID);
    }

    await pool.query(
      'INSERT INTO contact_messages (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)',
      [name, email, phone || '', subject || '', message]
    );
    return res.status(200).json({ success: true });
  } catch (error: any) {
    const errCode = typeof error?.code === 'string' ? error.code : undefined;
    const errName = typeof error?.name === 'string' ? error.name : 'Error';
    console.error('[contact] failed', errCode || errName);
    return res.status(500).json(SEND_FAILED);
  }
}
