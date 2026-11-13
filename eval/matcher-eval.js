// Runs the place matcher from index.html on fixed test cases and prints the scene design for review.
// Not used by the app. Needs OPENAI_API_KEY (or ANTHROPIC_API_KEY) in the environment, same as api/claude.js.
//
//   node eval/matcher-eval.js              all cases, 2 runs each
//   node eval/matcher-eval.js --runs 3 --case C
//   node eval/matcher-eval.js --check output.json   re-check a saved model response, no API call
//
// Raw model output is saved to eval/results/ (git-ignored).
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const handler = require("../api/claude.js");

const CASES = [
  { id: "A", statement: "I don't feel confident about my work so I avoid the difficult task." },
  { id: "B", statement: "I feel unmotivated because I have been trying only to be met with rejection or outcomes that don't match my efforts." },
  { id: "C", statement: "I've been looking for companionship and more connections because I feel sad." },
  { id: "D", statement: "I only feel validated when I keep myself busy. I feel guilty when I'm relaxing." }
];

const args = process.argv.slice(2);
const arg = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const RUNS = Number(arg("--runs", 2));
const ONLY = arg("--case", null);
const CHECK = arg("--check", null);

// Load the matcher exactly as the app ships it.
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const start = html.indexOf("/* MATCHER:BEGIN");
const end = html.indexOf("/* MATCHER:END */");
if (start < 0 || end < 0) throw new Error("MATCHER:BEGIN / MATCHER:END markers not found in index.html");
const matcherSrc = html.slice(start, end) + "\n;({roundPrompt, cleanRound});";

function loadMatcher(statement) {
  const S = { problem: statement, refined: statement, intake: [], userChain: null, causes: [], feedback: [], synth: null, rounds: [] };
  const ctx = { S, journey: () => [], allFeedback: () => [], clamp: (v, a, b) => Math.min(b, Math.max(a, v)), JSON, String, Number, Array, Math };
  return vm.runInNewContext(matcherSrc, ctx);
}

// Same request path as the browser: POST to the api/claude.js handler.
function callModel(prompt) {
  return new Promise((resolve, reject) => {
    const req = { method: "POST", headers: {}, body: { prompt, tier: "default", json: true } };
    const res = {
      code: 200,
      status(c) { this.code = c; return this; },
      json(d) { this.code === 200 ? resolve(d.text) : reject(new Error(`HTTP ${this.code}: ${JSON.stringify(d)}`)); }
    };
    handler(req, res).catch(reject);
  });
}
function parseJSONText(t) {
  const clean = String(t || "").replace(/```json|```/g, "").trim();
  try { return JSON.parse(clean); } catch (e) {}
  const a = clean.indexOf("{"), b = clean.lastIndexOf("}");
  return JSON.parse(clean.slice(a, b + 1));
}

// ---- Schema check ----
const str = { type: "string" };
const SCHEMA = {
  type: "object", required: ["user_chain", "places"], props: {
    user_chain: {
      type: "object", required: ["position", "problem", "belief", "feeling", "outcome", "sub_beliefs"], props: {
        position: str, problem: str, belief: str, feeling: str, outcome: str,
        sub_beliefs: { type: "array", min: 2, max: 4, items: {
          type: "object", required: ["id", "belief", "evidence", "source", "confidence"], props: {
            id: str, belief: str, evidence: str,
            source: { type: "string", enum: ["stated", "inferred"] },
            confidence: { type: "string", enum: ["low", "medium", "high"] }
          } } }
      }
    },
    places: { type: "array", min: 3, max: 3, items: {
      type: "object", required: ["name", "country", "lat", "lon", "why", "moment", "internal"], props: {
        name: str, country: str, why: str, lat: { type: "number" }, lon: { type: "number" },
        moment: { type: "object", required: ["title", "scene", "meaning", "reactions", "questions", "terms", "scene3d"], props: {
          title: str, scene: str, meaning: str,
          reactions: { type: "array", min: 1, max: 2, items: str },
          questions: { type: "array", min: 3, max: 4, items: str },
          terms: { type: "array", items: { type: "object", required: ["term", "definition"], props: { term: str, definition: str } } },
          scene3d: { type: "object" }
        } },
        internal: { type: "object", required: ["target_sub_belief", "protagonist", "position_match", "problem_match", "projected_belief", "predicted_outcome", "visible_outcome", "scene_belief", "feeling_cue", "role_clarity", "distance_check", "lever", "place_specific", "reapply_question"], props: {
          target_sub_belief: str, protagonist: str, problem_match: str, projected_belief: str, predicted_outcome: str,
          visible_outcome: str, scene_belief: str, feeling_cue: str, role_clarity: str, reapply_question: str,
          lever: { type: "string", enum: ["meaning", "holding", "setting", "scale", "direction"] },
          position_match: { type: "object", required: ["shared_relationship", "surface_difference"], props: { shared_relationship: str, surface_difference: str } },
          distance_check: { type: "object", required: ["not_too_far", "not_too_close"], props: { not_too_far: str, not_too_close: str } },
          place_specific: { type: "object", required: ["unique_here", "visitor_notice", "mood"], props: { unique_here: str, visitor_notice: str, mood: str } }
        } }
      } } }
  }
};
function validate(v, s, at, errs) {
  const type = Array.isArray(v) ? "array" : v === null ? "null" : typeof v;
  if (type !== s.type) { errs.push(`${at}: expected ${s.type}, got ${type}`); return errs; }
  if (s.type === "string" && !v.trim()) errs.push(`${at}: empty`);
  if (s.enum && !s.enum.includes(v)) errs.push(`${at}: "${v}" not one of ${s.enum.join(" | ")}`);
  if (s.type === "array") {
    if (s.min != null && v.length < s.min) errs.push(`${at}: ${v.length} items, need at least ${s.min}`);
    if (s.max != null && v.length > s.max) errs.push(`${at}: ${v.length} items, at most ${s.max}`);
    if (s.items) v.forEach((x, i) => validate(x, s.items, `${at}[${i}]`, errs));
  }
  if (s.type === "object") {
    (s.required || []).forEach(k => { if (!(k in v)) errs.push(`${at}.${k}: missing`); });
    Object.entries(s.props || {}).forEach(([k, ps]) => { if (k in v) validate(v[k], ps, `${at}.${k}`, errs); });
  }
  return errs;
}
function extraChecks(out) {
  const notes = [];
  const ids = ((out.user_chain && out.user_chain.sub_beliefs) || []).map(b => b.id);
  const targets = (out.places || []).map(p => p.internal && p.internal.target_sub_belief);
  targets.forEach((t, i) => { if (!ids.includes(t)) notes.push(`places[${i}] targets "${t}", which isn't a listed sub-belief`); });
  const distinct = new Set(targets).size;
  if (distinct < Math.min(3, ids.length)) notes.push(`only ${distinct} distinct sub-beliefs targeted across ${targets.length} places (of ${ids.length} available)`);
  (out.places || []).forEach((p, i) => {
    const m = p.moment || {};
    const userFacing = [p.why, m.title, m.scene, m.meaning, ...(m.reactions || []), ...(m.questions || [])].join(" ");
    if (/—/.test(userFacing)) notes.push(`places[${i}] has an em dash in user-facing text`);
  });
  return notes;
}

// ---- Run ----
async function runOne(c, run) {
  const { roundPrompt, cleanRound } = loadMatcher(c.statement);
  const t0 = Date.now();
  try {
    const text = await callModel(roundPrompt("initial", ""));
    const secs = Math.round((Date.now() - t0) / 1000);
    let out;
    try { out = parseJSONText(text); } catch (e) { return { c, run, secs, error: "Response wasn't valid JSON", text }; }
    const schemaErrors = validate(out, SCHEMA, "$", []);
    const appParses = !!cleanRound(out);
    return { c, run, secs, out, schemaErrors, notes: extraChecks(out), appParses };
  } catch (e) {
    return { c, run, secs: Math.round((Date.now() - t0) / 1000), error: e.message };
  }
}
function report(r) {
  const L = [];
  L.push(`\n${"=".repeat(78)}\nCase ${r.c.id}, run ${r.run}  (${r.secs}s)\n"${r.c.statement}"\n${"=".repeat(78)}`);
  if (r.error) { L.push(`ERROR: ${r.error}`); return L.join("\n"); }
  const ch = r.out.user_chain || {};
  L.push(`Schema: ${r.schemaErrors.length ? "FAIL" : "ok"}   App parser accepts it: ${r.appParses ? "yes" : "NO"}`);
  r.schemaErrors.forEach(e => L.push(`  - ${e}`));
  r.notes.forEach(n => L.push(`  ! ${n}`));
  L.push(`\nChain\n  position: ${ch.position}\n  problem:  ${ch.problem}\n  belief:   ${ch.belief}\n  feeling:  ${ch.feeling}\n  outcome:  ${ch.outcome}`);
  L.push(`Sub-beliefs`);
  (ch.sub_beliefs || []).forEach(b => L.push(`  ${b.id} [${b.source}, ${b.confidence}] ${b.belief}\n      evidence: ${b.evidence}`));
  (r.out.places || []).forEach((p, i) => {
    const I = p.internal || {}, m = p.moment || {};
    L.push(`\n  Place ${i + 1}: ${p.name}, ${p.country}`);
    L.push(`    target:            ${I.target_sub_belief}   (lever: ${I.lever})`);
    L.push(`    protagonist:       ${I.protagonist}`);
    L.push(`    projected belief:  ${I.projected_belief}`);
    L.push(`    predicted outcome: ${I.predicted_outcome}`);
    L.push(`    visible outcome:   ${I.visible_outcome}`);
    L.push(`    scene belief:      ${I.scene_belief}`);
    L.push(`    role clarity:      ${I.role_clarity}`);
    L.push(`    distance:          not too far: ${(I.distance_check || {}).not_too_far}\n                       not too close: ${(I.distance_check || {}).not_too_close}`);
    L.push(`    only here:         ${(I.place_specific || {}).unique_here}   (mood: ${(I.place_specific || {}).mood})`);
    L.push(`    [user sees] why:   ${p.why}`);
    L.push(`    [user sees] scene: ${m.scene}`);
    L.push(`    [user sees] reactions: ${(m.reactions || []).join("  |  ")}`);
    L.push(`    [user sees] questions: ${(m.questions || []).join("  |  ")}`);
  });
  return L.join("\n");
}

(async () => {
  if (CHECK) {
    const out = parseJSONText(fs.readFileSync(CHECK, "utf8"));
    const { cleanRound } = loadMatcher("");
    console.log(report({ c: { id: "-", statement: CHECK }, run: 1, secs: 0, out, schemaErrors: validate(out, SCHEMA, "$", []), notes: extraChecks(out), appParses: !!cleanRound(out) }));
    return;
  }
  const cases = CASES.filter(c => !ONLY || c.id === ONLY);
  const jobs = [];
  cases.forEach(c => { for (let run = 1; run <= RUNS; run++) jobs.push(runOne(c, run)); });
  console.log(`Running ${jobs.length} matcher calls in parallel...`);
  const results = await Promise.all(jobs);
  results.forEach(r => console.log(report(r)));
  const ok = results.filter(r => !r.error && !r.schemaErrors.length && r.appParses).length;
  console.log(`\n${ok}/${results.length} runs passed the schema check and the app parser.`);
  const dir = path.join(__dirname, "results");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `matcher-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify(results.map(r => ({ case: r.c.id, run: r.run, secs: r.secs, error: r.error, schemaErrors: r.schemaErrors, notes: r.notes, output: r.out })), null, 2));
  console.log(`Raw output saved to ${path.relative(process.cwd(), file)}`);
})();
