import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { server, username, password, action } = req.query;
  if (!server || !username || !password || !action) {
    return res.status(400).json({ error: 'server, username, password, action required' });
  }

  const base = String(server).replace(/\/$/, '');
  let url = `${base}/player_api.php?username=${username}&password=${password}&action=${action}`;
  // Pass optional stream_id (required for get_short_epg, get_series_info, get_vod_info)
  const { stream_id } = req.query;
  if (stream_id) url += `&stream_id=${encodeURIComponent(String(stream_id))}`;

  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return res.status(r.status).json({ error: `Upstream ${r.status}` });
    const data = await r.json();
    return res.status(200).json(data);
  } catch (err: any) {
    return res.status(502).json({ error: err.message });
  }
}
