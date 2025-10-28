// client/api/proxy-basename.js
export default async function handler(req, res) {
  const { address } = req.query;

  if (!address) {
    return res.status(400).json({ error: "Missing address" });
  }

  try {
    // 🔹 Call the OnchainKit API directly (no Vercel upstream)
    const response = await fetch(`https://api.onchainkit.xyz/api/v1/basenames/address/${address}`);

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: "Upstream error", detail: text });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(500).json({ error: "Proxy failed", detail: err.message });
  }
}
