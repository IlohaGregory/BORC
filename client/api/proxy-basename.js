// client/api/proxy-basename.js
export default async function handler(req, res) {
  try {
    // expected: /api/proxy-basename?address=0xabc...
    const address = (req.query.address || req.query.addr || '').toString().trim();
    if (!address) {
      res.status(400).json({ error: 'missing address query param' });
      return;
    }

    const upstream = `https://api.onchainkit.xyz/api/v1/basenames/address/${encodeURIComponent(address)}`;

    // Fetch upstream
    const upstreamRes = await fetch(upstream, { method: 'GET' });

    // If upstream returned non-JSON or error, forward error (but don't leak upstream headers)
    if (!upstreamRes.ok) {
      const txt = await upstreamRes.text().catch(() => '');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(upstreamRes.status).json({ error: 'upstream error', detail: txt });
      return;
    }

    const data = await upstreamRes.json().catch(() => null);

    // Add CORS header
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

    res.status(200).json(data);
  } catch (err) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    console.error('proxy-basename error', err);
    res.status(500).json({ error: 'proxy error', message: err?.message || String(err) });
  }
}
