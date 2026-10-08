// Forwards the page's AI requests to the Anthropic API.
// The API key stays here on the server and is never sent to the browser.
const { checkCode, rateLimited, readBody } = require("./_shared");

const MODELS = {
  default: process.env.MODEL_DEFAULT || "claude-sonnet-5-5",   // places, refinement, synthesis
  quick: process.env.MODEL_QUICK || "claude-haiku-4-5-20251001" // answers to questions
};
const MAX_TOKENS = { default: 8000, quick: 600 };
const MAX_PROMPT_CHARS = 60000;

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY" });
  if (!checkCode(req)) return res.status(401).json({ error: "Bad study code" });
  if (rateLimited(req, Number(process.env.REQUESTS_PER_MINUTE || 20))) return res.status(429).json({ error: "Too many requests" });

  const { prompt, tier, json } = readBody(req);
  if (typeof prompt !== "string" || !prompt.trim()) return res.status(400).json({ error: "Missing prompt" });
  if (prompt.length > MAX_PROMPT_CHARS) return res.status(413).json({ error: "Prompt too long" });
  const t = tier === "quick" ? "quick" : "default";

  const messages = [{ role: "user", content: prompt }];
  // JSON requests: the prompt already asks for JSON only, and the page strips any stray text around it.
  const system = json ? "Respond with a single valid JSON object and nothing else." : undefined;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({ model: MODELS[t], max_tokens: MAX_TOKENS[t], messages, ...(system ? { system } : {}) })
    });
    const data = await r.json();
    if (!r.ok) {
      console.error("Anthropic API error", r.status, JSON.stringify(data).slice(0, 500));
      return res.status(r.status === 429 ? 429 : 502).json({ error: "Upstream error" });
    }
    let text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    return res.status(200).json({ text });
  } catch (e) {
    console.error("Request failed", e);
    return res.status(502).json({ error: "Request failed" });
  }
};
