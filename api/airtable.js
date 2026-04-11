// NannyMaids — Airtable proxy (also used by Vercel via vercel.json rewrite)
const AT_KEY  = process.env.AIRTABLE_KEY;
const AT_BASE = process.env.AIRTABLE_BASE;

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  if (!AT_KEY || !AT_BASE) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Airtable not configured. Add AIRTABLE_KEY and AIRTABLE_BASE to environment variables.' }) };
  }

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid request body' }) }; }

  const { table, fields, action } = body;
  if (!table) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing table' }) };

  // LIST records (for admin dashboard)
  if (action === 'list') {
    const url = `https://api.airtable.com/v0/${AT_BASE}/${encodeURIComponent(table)}?maxRecords=200&sort[0][field]=Submitted&sort[0][direction]=desc`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${AT_KEY}` }
    });
    const data = await response.json();
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify(data) };
  }

  // CREATE record (default)
  if (!fields) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing fields' }) };
  const url = `https://api.airtable.com/v0/${AT_BASE}/${encodeURIComponent(table)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${AT_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  const data = await response.json();
  return { statusCode: 200, headers: HEADERS, body: JSON.stringify(data) };
};
