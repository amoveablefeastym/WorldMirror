// Helpers shared by the API routes. Files starting with "_" are not deployed as routes.
function checkCode(req, bodyCode) {
  const required = process.env.STUDY_CODE;
  if (!required) return true;
  const given = req.headers["x-study-code"] || bodyCode || "";
  return given === required;
}

// Simple per-IP limit. Best effort only: each server instance keeps its own count.
const hits = new Map();
function rateLimited(req, perMinute) {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > perMinute;
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}

module.exports = { checkCode, rateLimited, readBody };
