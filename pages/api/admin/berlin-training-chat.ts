import type { NextApiRequest, NextApiResponse } from 'next';
import Anthropic from '@anthropic-ai/sdk';
import pool from '@/lib/db';

type TrainingChatMessage = {
  role: 'user' | 'assistant';
  content: string;
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

function normaliseHistory(history: unknown): TrainingChatMessage[] {
  if (!Array.isArray(history)) return [];

  return history
    .map((item) => {
      const candidate = item as { role?: unknown; content?: unknown };
      return {
        role: candidate.role === 'assistant' ? 'assistant' : candidate.role === 'user' ? 'user' : null,
        content: typeof candidate.content === 'string' ? candidate.content.trim() : '',
      };
    })
    .filter((item): item is TrainingChatMessage => !!item.role && item.content.length > 0)
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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await ensureBerlinTrainingTable();

    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) return res.status(400).json({ error: 'Message is required' });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Chat is not configured' });

    const currentTraining = await getCurrentTrainingKnowledge();
    const history = normaliseHistory(req.body?.history);
    const messages: TrainingChatMessage[] = [...history, { role: 'user', content: message }];

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

    return res.status(200).json({
      response: save?.cleanReply || rawReply,
      saved: !!save,
      savedTraining: save ? { title: save.title, content: save.content } : null,
    });
  } catch (error: unknown) {
    console.error('[berlin-training-chat] API error:', error);
    return res.status(500).json({ error: 'Training chat request failed' });
  }
}
