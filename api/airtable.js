// NannyMaids — Airtable proxy (Vercel)
const AT_KEY  = process.env.AIRTABLE_KEY;
const AT_BASE = process.env.AIRTABLE_BASE;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!AT_KEY || !AT_BASE) {
    return res.status(500).json({ error: 'Airtable not configured. Add AIRTABLE_KEY and AIRTABLE_BASE to Vercel environment variables.' });
  }

  const { table, fields } = req.body;
  if (!table || !fields) return res.status(400).json({ error: 'Missing table or fields' });

  const url = `https://api.airtable.com/v0/${AT_BASE}/${encodeURIComponent(table)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AT_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });

  const data = await response.json();
  return res.status(200).json(data);
};
