// ─────────────────────────────────────────────────────────────
// Vercel Serverless Function — AI content generation proxy
//
// Keeps the Anthropic API key server-side (never in the JS bundle).
// Solves two problems with calling Anthropic directly from the browser:
//   1. CORS — api.anthropic.com blocks browser origins
//   2. Key exposure — x-api-key would be visible in DevTools
//
// Set in Vercel Dashboard → Settings → Environment Variables:
//   ANTHROPIC_API_KEY = sk-ant-...
// ─────────────────────────────────────────────────────────────

const ANTHROPIC_API  = 'https://api.anthropic.com/v1/messages';
const MAX_PROMPT_LEN = 1000; // prevent prompt-injection abuse via oversized inputs

// Allowed origins — add your production domain here
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

export default async function handler(req, res) {
  // Validate origin to prevent cross-site abuse
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.length > 0 && origin && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  // Preflight
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Only POST is accepted
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'AI service not configured' });
  }

  const { prompt, tone, platform, maxChars } = req.body || {};

  if (!prompt?.trim()) {
    return res.status(400).json({ error: 'prompt is required' });
  }
  if (prompt.length > MAX_PROMPT_LEN) {
    return res.status(400).json({ error: `Prompt exceeds ${MAX_PROMPT_LEN} character limit` });
  }

  const safeTone     = String(tone     || 'professional').slice(0, 50);
  const safePlatform = String(platform || 'Social Media').slice(0, 50);
  const safeMaxChars = Math.min(Number(maxChars) || 2200, 40000);

  // System prompt defines role and rules — does NOT include user input.
  // User prompt contains the topic so injection cannot override system instructions.
  const systemPrompt = [
    `You are a social media content expert.`,
    `Write a ${safeTone} post for ${safePlatform}.`,
    `Character limit: ${safeMaxChars} characters.`,
    `Rules: write ONLY the post text (no commentary), include relevant emojis,`,
    `include a call to action, add 3–5 hashtags at the end, stay within the character limit.`,
  ].join(' ');

  try {
    const upstream = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 1024,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: `Topic: ${prompt.trim()}` }],
      }),
    });

    if (!upstream.ok) {
      const err = await upstream.json().catch(() => ({}));
      // Don't forward the raw Anthropic error — it may contain key hints
      const msg = upstream.status === 401 ? 'Invalid API key'
                : upstream.status === 429 ? 'Rate limit reached — try again shortly'
                : `AI provider error (${upstream.status})`;
      return res.status(upstream.status >= 500 ? 502 : upstream.status).json({ error: msg });
    }

    const data = await upstream.json();
    const text = data.content?.map(c => c.text || '').join('') || '';
    if (!text) return res.status(502).json({ error: 'Empty response from AI' });

    return res.status(200).json({ text });
  } catch (e) {
    return res.status(502).json({ error: `Upstream request failed: ${e.message}` });
  }
}
