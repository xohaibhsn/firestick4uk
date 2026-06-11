import type { NextApiRequest, NextApiResponse } from 'next';
import Anthropic from '@anthropic-ai/sdk';
import pool from '@/lib/db';

type TrainingChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  saved?: boolean;
};

type StoredTrainingChatMessage = TrainingChatMessage & {
  id?: number;
  created_at?: unknown;
};

function checkAdminAuth(req: NextApiRequest): boolean {
  const session = req.headers['x-admin-session'] || req.cookies?.sAdminSession;
  return !!session;
}

async function ensureBerlinTrainingTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS berlin_training (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}

async function ensureBerlinTrainingChatTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS berlin_training_chat_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      role ENUM('user','assistant') NOT NULL,
      content TEXT NOT NULL,
      saved_training_title VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getTrainingChatHistory(limit = 80) {
  const [rows] = await pool.query(
    `SELECT * FROM (
      SELECT id, role, content, saved_training_title, created_at
      FROM berlin_training_chat_messages
      ORDER BY id DESC
      LIMIT ?
    ) recent_messages ORDER BY id ASC`,
    [limit]
  );
  if (!Array.isArray(rows)) return [];

  const messages: StoredTrainingChatMessage[] = [];
  rows
    .map((row) => {
      const item = row as {
        id?: number;
        role?: unknown;
        content?: unknown;
        saved_training_title?: unknown;
        created_at?: unknown;
      };
      return {
        id: item.id,
        role: item.role === 'assistant' ? 'assistant' : item.role === 'user' ? 'user' : null,
        content: typeof item.content === 'string' ? item.content : '',
        saved: typeof item.saved_training_title === 'string' && item.saved_training_title.length > 0,
        created_at: item.created_at,
      };
    })
    .forEach((item) => {
      if ((item.role === 'user' || item.role === 'assistant') && item.content.length > 0) {
        messages.push({
          id: item.id,
          role: item.role,
          content: item.content,
          saved: item.saved,
          created_at: item.created_at,
        });
      }
    });

  return messages;
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

async function getCurrentTrainingKnowledge() {
  const [rows] = await pool.query(
    'SELECT title, content FROM berlin_training WHERE is_active=1 ORDER BY updated_at DESC, id DESC LIMIT 25'
  );
  if (!Array.isArray(rows) || rows.length === 0) return 'No saved training notes yet.';

  return rows
    .map((row) => {
      const item = row as { title?: string; content?: string };
      return `- ${item.title || 'Training note'}: ${item.content || ''}`;
    })
    .join('\n');
}

function extractTrainingSave(reply: string) {
  const match = reply.match(/\s*\[TRAINING_SAVE\]([\s\S]*?)\[\/TRAINING_SAVE\]\s*$/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]) as { title?: unknown; content?: unknown };
    const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
    const content = typeof parsed.content === 'string' ? parsed.content.trim() : '';
    if (!title || !content) return null;
    return {
      title: title.slice(0, 255),
      content,
      cleanReply: reply.replace(match[0], '').trim(),
    };
  } catch {
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });

  try {
    await ensureBerlinTrainingTable();
    await ensureBerlinTrainingChatTable();

    if (req.method === 'GET') {
      const history = await getTrainingChatHistory(500);
      return res.status(200).json(history);
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) return res.status(400).json({ error: 'Message is required' });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Chat is not configured' });

    const currentTraining = await getCurrentTrainingKnowledge();
    const history = await getTrainingChatHistory(60);
    const messages: TrainingChatMessage[] = [
      ...history.map((item) => ({ role: item.role, content: item.content })),
      { role: 'user', content: message },
    ];
    await pool.query(
      'INSERT INTO berlin_training_chat_messages (role, content) VALUES (?,?)',
      ['user', message]
    );

    const system = `You are Berlin in Firestick4UK admin training mode. The admin is "Professor".

ROLEPLAY:
- Speak as Berlin from Money Heist style: confident, witty, loyal to Professor, but concise.
- Address the admin as Professor.
- This is internal admin training, not customer support.

JOB:
- Let Professor ask what you know and what you do not know.
- Explain your current knowledge honestly using the saved training notes below.
- If Professor gives a correction, business rule, product detail, policy, device setup note, or says save/remember/train this, turn it into a clean reusable training note.
- Only save when Professor clearly instructs you to save/remember/train/correct something. Do not save normal questions.
- When saving, reply naturally and append exactly one hidden tag at the very end:
[TRAINING_SAVE]{"title":"short title","content":"clear instruction Berlin must follow"}[/TRAINING_SAVE]
- Do not show or mention the hidden tag in your visible response.

CURRENT SAVED BERLIN TRAINING:
${currentTraining}`;

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const completion = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
      max_tokens: 800,
      system,
      messages,
    });

    const rawReply = extractText(completion.content);
    const save = extractTrainingSave(rawReply);
    if (save) {
      await pool.query(
        'INSERT INTO berlin_training (title, content, is_active) VALUES (?,?,1)',
        [save.title, save.content]
      );
    }
    const cleanReply = save?.cleanReply || rawReply;
    await pool.query(
      'INSERT INTO berlin_training_chat_messages (role, content, saved_training_title) VALUES (?,?,?)',
      ['assistant', cleanReply, save?.title || null]
    );

    return res.status(200).json({
      response: cleanReply,
      saved: !!save,
      savedTraining: save ? { title: save.title, content: save.content } : null,
    });
  } catch (error: unknown) {
    console.error('[berlin-training-chat] API error:', error);
    return res.status(500).json({ error: 'Training chat request failed' });
  }
}
