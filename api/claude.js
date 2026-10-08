// Forwards the page's AI requests to OpenAI or Anthropic.
// The API key stays here on the server and is never sent to the browser.
//
// Provider: set AI_PROVIDER to "openai" or "anthropic". If it's not set, the
// server uses OpenAI when OPENAI_API_KEY is present, otherwise Anthropic.
const { checkCode, rateLimited, readBody } = require("./_shared");

const MAX_PROMPT_CHARS = 60000;
const JSON_SYSTEM = "Respond with a single valid JSON object and nothing else.";

function provider() {
  const p = (process.env.AI_PROVIDER || "").toLowerCase();
  if (p === "openai" || p === "anthropic") return p;
  return process.env.OPENAI_API_KEY ? "openai" : "anthropic";
}

async function callOpenAI(prompt, tier, json) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw { status: 500, msg: "Server is missing OPENAI_API_KEY" };
  const model = tier === "quick"
    ? (process.env.OPENAI_MODEL_QUICK || "gpt-5-mini")
    : (process.env.OPENAI_MODEL_DEFAULT || "gpt-5");
  const reasoning = /^(gpt-5|o\d)/.test(model);
  const messages = [];
  if (json) messages.push({ role: "system", content: JSON_SYSTEM });
  messages.push({ role: "user", content: prompt });
  const body = {
    model,
    messages,
    // Reasoning models count their thinking toward this limit, so leave room.
    max_completion_tokens: tier === "quick" ? 4000 : 16000
  };
  if (json) body.response_format = { type: "json_object" };
  if (reasoning) body.reasoning_effort = process.env.OPENAI_REASONING_EFFORT || (tier === "quick" ? "minimal" : "low");

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + key },
    body: JSON.stringify(body)
  });
  const data = await r.json();
  if (!r.ok) {
    console.error("OpenAI API error", r.status, JSON.stringify(data).slice(0, 500));
    throw { status: r.status === 429 ? 429 : 502, msg: "Upstream error" };
  }
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
}

async function callAnthropic(prompt, tier, json) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw { status: 500, msg: "Server is missing ANTHROPIC_API_KEY" };
  const model = tier === "quick"
    ? (process.env.MODEL_QUICK || "claude-haiku-5-5")
    : (process.env.MODEL_DEFAULT || "claude-sonnet-5-5");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: tier === "quick" ? 600 : 8000,
      messages: [{ role: "user", content: prompt }],
      ...(json ? { system: JSON_SYSTEM } : {})
    })
  });
  const data = await r.json();
  if (!r.ok) {
    console.error("Anthropic API error", r.status, JSON.stringify(data).slice(0, 500));
    throw { status: r.status === 429 ? 429 : 502, msg: "Upstream error" };
  }
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!checkCode(req)) return res.status(401).json({ error: "Bad study code" });
  if (rateLimited(req, Number(process.env.REQUESTS_PER_MINUTE || 20))) return res.status(429).json({ error: "Too many requests" });

  const { prompt, tier, json } = readBody(req);
  if (typeof prompt !== "string" || !prompt.trim()) return res.status(400).json({ error: "Missing prompt" });
  if (prompt.length > MAX_PROMPT_CHARS) return res.status(413).json({ error: "Prompt too long" });
  const t = tier === "quick" ? "quick" : "default";

  try {
    const text = provider() === "openai" ? await callOpenAI(prompt, t, !!json) : await callAnthropic(prompt, t, !!json);
    return res.status(200).json({ text });
  } catch (e) {
    if (e && e.status) { if (e.status === 500) console.error(e.msg); return res.status(e.status).json({ error: e.msg }); }
    console.error("Request failed", e);
    return res.status(502).json({ error: "Request failed" });
  }
};
