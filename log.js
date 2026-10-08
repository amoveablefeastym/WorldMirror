// Receives session logs from the page.
// Always prints them to the server logs. If LOG_WEBHOOK_URL is set, also forwards
// each log there (for example, the Google Apps Script in google-sheet-logger.gs).
const { checkCode, rateLimited, readBody } = require("./_shared");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const body = readBody(req);
  if (!checkCode(req, body.code)) return res.status(401).json({ error: "Bad study code" });
  if (rateLimited(req, 60)) return res.status(429).json({ error: "Too many requests" });
  const log = body.log;
  if (!log || typeof log !== "object") return res.status(400).json({ error: "Missing log" });

  const line = JSON.stringify({ received_at: new Date().toISOString(), ...log });
  if (line.length > 500000) return res.status(413).json({ error: "Log too large" });
  console.log("SESSION_LOG", line);

  if (process.env.LOG_WEBHOOK_URL) {
    try {
      await fetch(process.env.LOG_WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json" }, body: line });
    } catch (e) {
      console.error("Webhook failed", e);
    }
  }
  return res.status(200).json({ ok: true });
};
