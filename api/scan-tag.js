// Vercel Serverless Function — scan-tag
// OCR via Groq Vision API

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { image } = req.body;
    if (!image) throw new Error('No image provided');

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY not configured');

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Extract auction tag info as JSON with fields: itemNumber, year, make, model, crScore, vin, docs, milesHours. Return ONLY valid JSON.' },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } }
          ]
        }],
        temperature: 0.1,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) throw new Error('Rate limit - wait 30 seconds');
      throw new Error('Groq error: ' + response.status);
    }

    const data = await response.json();
    let text = data.choices?.[0]?.message?.content || '';

    const startIdx = text.indexOf('{');
    const endIdx = text.lastIndexOf('}');
    if (startIdx === -1 || endIdx === -1) throw new Error('Could not parse response');

    const parsed = JSON.parse(text.substring(startIdx, endIdx + 1));
    return res.status(200).json({ success: true, data: parsed });
  } catch (error) {
    console.error('Scan error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Unknown error' });
  }
}
