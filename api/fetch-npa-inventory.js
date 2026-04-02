// Vercel Serverless Function — fetch-npa-inventory
// Proxy to GCP Cloud Run NPA API

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const limit = req.query.limit || '1000';
    const npaApiUrl = `https://playwright-reports-150462460430.us-west4.run.app/report/npauctions/inventory?limit=${limit}`;

    const response = await fetch(npaApiUrl);
    if (!response.ok) throw new Error(`NPA API failed: ${response.status}`);

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('NPA proxy error:', error);
    return res.status(500).json({ error: error.message || 'Unknown error' });
  }
}
