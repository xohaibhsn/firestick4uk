import type { NextApiRequest, NextApiResponse } from 'next';
import http from 'http';
import https from 'https';

export const config = { api: { bodyParser: false, responseLimit: false } };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type',
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }

  const raw = req.query.url;
  if (!raw || typeof raw !== 'string') {
    return res.status(400).json({ error: 'Missing url param' });
  }

  let targetUrl: string;
  try {
    targetUrl = decodeURIComponent(raw);
    new URL(targetUrl); // validate
  } catch {
    return res.status(400).json({ error: 'Invalid url' });
  }

  const client = targetUrl.startsWith('https') ? https : http;

  const upstream = client.get(
    targetUrl,
    { headers: { 'User-Agent': 'Mozilla/5.0', ...(req.headers.range ? { Range: req.headers.range } : {}) } },
    (upstream) => {
      const status = upstream.statusCode || 200;
      const ct = upstream.headers['content-type'] || 'application/octet-stream';
      const cl = upstream.headers['content-length'];
      const cr = upstream.headers['content-range'];

      const outHeaders: Record<string, string> = { ...CORS, 'Content-Type': ct };
      if (cl) outHeaders['Content-Length'] = cl;
      if (cr) outHeaders['Content-Range'] = cr;

      res.writeHead(status, outHeaders);
      upstream.pipe(res);
      upstream.on('error', () => res.end());
    }
  );

  upstream.on('error', () => {
    if (!res.headersSent) res.status(502).json({ error: 'Upstream error' });
    else res.end();
  });

  req.on('close', () => upstream.destroy());
}
