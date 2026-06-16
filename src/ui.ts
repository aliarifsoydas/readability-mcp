// Lightweight web UI + Basic Auth gate for the readability tools.
// Reuses the same scoring functions the MCP tools expose, served over plain
// JSON endpoints so a browser can drive them directly.

export interface UiEnv {
  UI_USER?: string;
  UI_PASS?: string;
}

const enc = new TextEncoder();

// Length-safe-ish constant-time comparison to avoid trivial timing leaks.
function safeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= (ab[i] as number) ^ (bb[i] as number);
  return diff === 0;
}

export type AuthResult =
  | { ok: true }
  | { ok: false; response: Response };

const UNAUTH = () =>
  new Response("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="readability-mcp UI", charset="UTF-8"',
      "content-type": "text/plain; charset=utf-8",
    },
  });

/** Gate a request behind HTTP Basic Auth using UI_USER / UI_PASS secrets. */
export function checkAuth(request: Request, env: UiEnv): AuthResult {
  const user = env.UI_USER;
  const pass = env.UI_PASS;

  // Fail closed: if credentials aren't configured, never serve the UI/API.
  if (!user || !pass) {
    return {
      ok: false,
      response: new Response(
        "UI is not configured. Set UI_USER and UI_PASS as Worker secrets.",
        { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
      ),
    };
  }

  const header = request.headers.get("Authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) return { ok: false, response: UNAUTH() };

  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return { ok: false, response: UNAUTH() };
  }
  const idx = decoded.indexOf(":");
  if (idx === -1) return { ok: false, response: UNAUTH() };
  const u = decoded.slice(0, idx);
  const p = decoded.slice(idx + 1);

  // Compare both fields regardless of the first result to stay timing-flat.
  const okUser = safeEqual(u, user);
  const okPass = safeEqual(p, pass);
  if (okUser && okPass) return { ok: true };
  return { ok: false, response: UNAUTH() };
}

export function renderUiHtml(): string {
  return /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Readability Studio</title>
<style>
  :root {
    --bg: #0f1115; --panel: #181b22; --panel2: #1f232c; --border: #2a2f3a;
    --txt: #e7e9ee; --muted: #9aa3b2; --accent: #6ea8fe; --accent2: #54d6a4;
    --warn: #f0b34a; --bad: #f0726a; --good: #54d6a4;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--txt);
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  header {
    padding: 18px 24px; border-bottom: 1px solid var(--border);
    display: flex; align-items: baseline; gap: 12px;
  }
  header h1 { font-size: 18px; margin: 0; font-weight: 650; }
  header span { color: var(--muted); font-size: 13px; }
  main { max-width: 1080px; margin: 0 auto; padding: 24px; display: grid; gap: 18px; grid-template-columns: 1fr 1fr; }
  @media (max-width: 860px) { main { grid-template-columns: 1fr; } }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 18px; }
  .card.full { grid-column: 1 / -1; }
  label { display: block; font-size: 13px; color: var(--muted); margin: 0 0 6px; }
  textarea {
    width: 100%; min-height: 220px; resize: vertical; background: var(--panel2);
    color: var(--txt); border: 1px solid var(--border); border-radius: 8px;
    padding: 12px; font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 12px; }
  select, button {
    background: var(--panel2); color: var(--txt); border: 1px solid var(--border);
    border-radius: 8px; padding: 9px 14px; font-size: 14px; cursor: pointer;
  }
  button.primary { background: var(--accent); color: #07101f; border-color: var(--accent); font-weight: 600; }
  button:hover { border-color: var(--accent); }
  button:disabled { opacity: .5; cursor: default; }
  .btns { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
  .meta { color: var(--muted); font-size: 12px; margin-left: auto; }
  .score-big { font-size: 44px; font-weight: 700; line-height: 1; }
  .score-sub { color: var(--muted); font-size: 13px; margin-top: 4px; }
  .verdict { margin: 14px 0 4px; padding: 10px 12px; border-radius: 8px; background: var(--panel2); border: 1px solid var(--border); }
  .pill { display: inline-block; padding: 2px 9px; border-radius: 99px; font-size: 12px; font-weight: 600; }
  .pill.pass { background: rgba(84,214,164,.15); color: var(--good); }
  .pill.fail { background: rgba(240,114,106,.15); color: var(--bad); }
  ul.advice { margin: 10px 0 0; padding-left: 18px; }
  ul.advice li { margin: 4px 0; }
  .bars { margin-top: 14px; display: grid; gap: 8px; }
  .bar { display: grid; grid-template-columns: 160px 1fr 44px; gap: 10px; align-items: center; font-size: 13px; }
  .bar .track { height: 8px; background: var(--panel2); border-radius: 99px; overflow: hidden; }
  .bar .fill { height: 100%; background: var(--accent2); }
  .bar .lbl { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  details { margin-top: 14px; }
  summary { cursor: pointer; color: var(--muted); font-size: 13px; }
  pre { background: var(--panel2); border: 1px solid var(--border); border-radius: 8px; padding: 12px; overflow: auto; font-size: 12px; max-height: 360px; }
  .empty { color: var(--muted); font-size: 14px; }
  .err { color: var(--bad); }
</style>
</head>
<body>
<header>
  <h1>Readability Studio</h1>
  <span>readability-mcp · paste text, get scores &amp; suggestions</span>
</header>
<main>
  <section class="card">
    <label for="text">Text</label>
    <textarea id="text" placeholder="Paste the text you want to analyze…"></textarea>
    <div class="row">
      <label style="margin:0">Language</label>
      <select id="lang">
        <option value="auto">auto-detect</option>
        <option value="en">English</option>
        <option value="tr">Türkçe</option>
        <option value="es">Español</option>
        <option value="de">Deutsch</option>
        <option value="fr">Français</option>
        <option value="it">Italiano</option>
      </select>
      <span class="meta" id="charcount">0 chars</span>
    </div>
    <div class="btns">
      <button class="primary" data-tool="seo">SEO score</button>
      <button data-tool="score">Readability</button>
      <button data-tool="flow">Flow</button>
      <button data-tool="ai" data-tier="heuristic">AI-detect (free)</button>
    </div>
    <div class="row">
      <label style="margin:0">AI LLM tier</label>
      <select id="aitier">
        <option value="cheap">cheap (~$0.01)</option>
        <option value="premium">premium (~$0.07)</option>
      </select>
      <button data-tool="ai" data-tier="llm">AI-detect (LLM panel)</button>
    </div>
  </section>

  <section class="card" id="resultCard">
    <div id="result"><p class="empty">Run a tool to see results here.</p></div>
  </section>

  <section class="card full">
    <details>
      <summary>Raw JSON response</summary>
      <pre id="raw">—</pre>
    </details>
  </section>
</main>
<script>
const $ = (s) => document.querySelector(s);
const textEl = $("#text"), result = $("#result"), raw = $("#raw");
textEl.addEventListener("input", () => { $("#charcount").textContent = textEl.value.length + " chars"; });

function scoreColor(v) { return v >= 70 ? "var(--good)" : v >= 45 ? "var(--warn)" : "var(--bad)"; }
function esc(s){ return String(s).replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }

function bars(obj) {
  if (!obj || typeof obj !== "object") return "";
  const rows = Object.entries(obj).filter(([,v]) => typeof v === "number").map(([k,v]) => {
    const pct = Math.max(0, Math.min(100, v));
    return '<div class="bar"><span class="lbl">'+esc(k)+'</span>'
      + '<span class="track"><span class="fill" style="width:'+pct+'%;background:'+scoreColor(v)+'"></span></span>'
      + '<span>'+Math.round(v)+'</span></div>';
  });
  return rows.length ? '<div class="bars">'+rows.join("")+'</div>' : "";
}

function render(tool, data) {
  if (data.error) { result.innerHTML = '<p class="err">'+esc(data.error)+'</p>'; return; }
  let html = "";
  const headline =
    tool === "ai" ? data.composite_score :
    tool === "seo" ? data.overall_100 :
    data.overall_100;
  if (typeof headline === "number") {
    const label = tool === "ai" ? "AI-likeness (lower = more human)" : "Overall / 100";
    html += '<div class="score-big" style="color:'+scoreColor(tool==="ai"?100-headline:headline)+'">'+headline+'</div>';
    html += '<div class="score-sub">'+label+(data.language?(' · lang: '+esc(data.language)):'')+'</div>';
  }
  if (typeof data.passed === "boolean")
    html += '<div style="margin-top:8px"><span class="pill '+(data.passed?'pass':'fail')+'">'+(data.passed?'PASSED':'NEEDS WORK')+'</span></div>';
  if (data.verdict) html += '<div class="verdict">'+esc(data.verdict)+'</div>';

  const advice = data.suggestions || data.summary_advice;
  if (Array.isArray(advice) && advice.length)
    html += '<ul class="advice">'+advice.map(a => '<li>'+esc(a)+'</li>').join("")+'</ul>';

  // Metric breakdown bars
  if (tool === "flow") html += bars(data.metrics_100);
  else if (tool === "score") html += bars(data.metrics_100);
  else if (tool === "seo") html += bars(data.breakdown && data.breakdown.flow_metrics);
  else if (tool === "ai" && data.signals) {
    const sig = {};
    for (const [k,v] of Object.entries(data.signals)) if (v && typeof v.score === "number") sig[k]=v.score;
    html += bars(sig);
    if (typeof data.total_cost_usd === "number") html += '<div class="score-sub">cost: $'+data.total_cost_usd.toFixed(4)+'</div>';
  }
  result.innerHTML = html || '<p class="empty">No displayable fields — see raw JSON.</p>';
}

async function run(btn) {
  const tool = btn.dataset.tool;
  const text = textEl.value.trim();
  if (!text) { result.innerHTML = '<p class="err">Enter some text first.</p>'; return; }
  const body = { text, language: $("#lang").value };
  if (tool === "ai" && btn.dataset.tier === "llm") body.tier = $("#aitier").value;
  document.querySelectorAll("button[data-tool]").forEach(b => b.disabled = true);
  result.innerHTML = '<p class="empty">Scoring…</p>';
  try {
    const res = await fetch("/api/" + tool, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    raw.textContent = JSON.stringify(data, null, 2);
    render(tool, data);
  } catch (e) {
    result.innerHTML = '<p class="err">Request failed: '+esc(e.message)+'</p>';
  } finally {
    document.querySelectorAll("button[data-tool]").forEach(b => b.disabled = false);
  }
}
document.querySelectorAll("button[data-tool]").forEach(b => b.addEventListener("click", () => run(b)));
</script>
</body>
</html>`;
}
