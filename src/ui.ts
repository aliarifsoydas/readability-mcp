// Web UI + Basic Auth gate for the readability tools.
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

export type AuthResult = { ok: true } | { ok: false; response: Response };

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
<title>The Readability Review</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..700&family=Newsreader:ital,opsz,wght@0,6..72,300..600;1,6..72,400&family=Courier+Prime:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
<style>
  :root{
    --paper:#f1e9d9; --paper2:#e9dfca; --ink:#211c14; --ink-soft:#5a5142;
    --rule:#221d15; --hair:#cbbfa3; --red:#a8261b; --red-soft:#c4493c;
    --good:#3f5e3a; --mid:#9a6f1c; --bad:#a8261b;
    --serif:"Newsreader",Georgia,serif;
    --display:"Fraunces","Times New Roman",serif;
    --mono:"Courier Prime","Courier New",monospace;
  }
  *{box-sizing:border-box;}
  html{-webkit-font-smoothing:antialiased;}
  body{
    margin:0; background:var(--paper); color:var(--ink);
    font-family:var(--serif); font-size:18px; line-height:1.6;
    background-image:
      radial-gradient(circle at 20% 10%, rgba(255,255,255,.35), transparent 40%),
      radial-gradient(circle at 85% 90%, rgba(120,90,40,.07), transparent 45%);
  }
  body::before{
    content:""; position:fixed; inset:0; pointer-events:none; z-index:9999; opacity:.05;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }
  .wrap{max-width:1180px; margin:0 auto; padding:0 28px 80px;}

  /* ---- Masthead ---- */
  .masthead{ text-align:center; padding:36px 0 14px; border-bottom:3px double var(--rule); }
  .masthead .kicker{ font-family:var(--mono); font-size:11px; letter-spacing:.42em; text-transform:uppercase; color:var(--ink-soft); }
  .masthead h1{
    font-family:var(--display); font-weight:600; font-size:clamp(40px,7vw,86px);
    line-height:.94; margin:8px 0 6px; letter-spacing:-.02em; font-optical-sizing:auto;
  }
  .masthead h1 em{ font-style:italic; color:var(--red); }
  .masthead .sub{ font-style:italic; font-size:17px; color:var(--ink-soft); }
  .dateline{
    display:flex; justify-content:space-between; align-items:center;
    font-family:var(--mono); font-size:11px; letter-spacing:.18em; text-transform:uppercase;
    color:var(--ink-soft); padding:8px 2px; border-bottom:1px solid var(--rule); margin-bottom:30px;
  }
  .dateline span:nth-child(2){ letter-spacing:.05em; }

  /* ---- Desk layout ---- */
  .desk{ display:grid; grid-template-columns:1.15fr .85fr; gap:0; }
  @media (max-width:880px){ .desk{ grid-template-columns:1fr; } }
  .col-ms{ padding-right:34px; border-right:1px solid var(--hair); }
  .col-side{ padding-left:34px; }
  @media (max-width:880px){
    .col-ms{ border-right:none; padding-right:0; border-bottom:1px solid var(--hair); padding-bottom:28px; }
    .col-side{ padding-left:0; padding-top:28px; }
  }
  .label{ font-family:var(--mono); font-size:11px; letter-spacing:.24em; text-transform:uppercase; color:var(--red); margin:0 0 10px; }

  textarea{
    width:100%; min-height:360px; resize:vertical; background:#ffffff; color:#1a1712;
    border:1px solid var(--hair); outline:none; padding:22px 24px;
    font-family:var(--serif); font-size:19px; line-height:1.72;
    box-shadow:0 1px 0 rgba(255,255,255,.6) inset, 3px 4px 14px rgba(40,30,12,.12);
    transition:box-shadow .18s, border-color .18s;
  }
  textarea:focus{ border-color:var(--ink); box-shadow:0 0 0 1px var(--ink), 3px 6px 18px rgba(40,30,12,.16); }
  textarea::placeholder{ color:#9c8f72; font-style:italic; }
  .ms-frame{ padding:4px 0; }

  .controls{ display:flex; align-items:center; gap:18px; flex-wrap:wrap; margin-top:18px; }
  .stat{ font-family:var(--mono); font-size:12px; letter-spacing:.08em; color:var(--ink-soft); text-transform:uppercase; }
  .stat b{ color:var(--ink); font-size:15px; }
  select{
    appearance:none; background:transparent; border:none; border-bottom:1.5px solid var(--ink);
    font-family:var(--mono); font-size:12px; letter-spacing:.1em; text-transform:uppercase; color:var(--ink);
    padding:4px 22px 4px 2px; cursor:pointer;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23211c14'/%3E%3C/svg%3E");
    background-repeat:no-repeat; background-position:right 2px center;
  }
  .submit{
    margin-top:26px; width:100%; background:var(--ink); color:var(--paper); border:none; cursor:pointer;
    font-family:var(--mono); font-size:13px; letter-spacing:.28em; text-transform:uppercase; padding:16px;
    transition:background .18s;
  }
  .submit:hover{ background:var(--red); }
  .submit:disabled{ opacity:.45; cursor:wait; }

  /* ---- Verdict / scorecard ---- */
  .placeholder{ font-style:italic; color:var(--ink-soft); font-size:19px; }
  .placeholder::first-letter{ font-family:var(--display); font-size:58px; float:left; line-height:.7; padding:6px 10px 0 0; color:var(--red); font-style:normal; }

  .grades{ display:grid; grid-template-columns:1fr 1fr; gap:0; border-top:1px solid var(--rule); }
  .grade{ padding:18px 16px; border-bottom:1px solid var(--hair); }
  .grade:nth-child(odd){ border-right:1px solid var(--hair); }
  .grade .gname{ font-family:var(--mono); font-size:10px; letter-spacing:.18em; text-transform:uppercase; color:var(--ink-soft); }
  .grade .gnum{ font-family:var(--display); font-weight:500; font-size:54px; line-height:1; letter-spacing:-.02em; font-optical-sizing:auto; }
  .grade .gnum small{ font-size:20px; color:var(--ink-soft); font-weight:400; }
  .grade .gnote{ font-style:italic; font-size:13px; color:var(--ink-soft); margin-top:2px; }
  .seal{ display:inline-block; font-family:var(--mono); font-size:10px; letter-spacing:.16em; text-transform:uppercase; padding:3px 9px; border:1.5px solid currentColor; border-radius:2px; margin-top:6px; }
  .seal.pass{ color:var(--good); } .seal.fail{ color:var(--red); }

  .verdict-line{ font-family:var(--display); font-style:italic; font-weight:400; font-size:24px; margin:22px 0 4px; line-height:1.3; }

  /* ---- Editor's marks (suggestions) ---- */
  .marks{ margin-top:18px; border-top:3px double var(--rule); padding-top:14px; }
  .marks h3{ font-family:var(--mono); font-size:11px; letter-spacing:.24em; text-transform:uppercase; color:var(--red); margin:0 0 10px; }
  .marks ul{ list-style:none; margin:0; padding:0; }
  .marks li{ position:relative; padding:6px 0 6px 26px; font-style:italic; border-bottom:1px dotted var(--hair); }
  .marks li::before{ content:"\\270E"; position:absolute; left:0; top:6px; color:var(--red); font-style:normal; font-size:16px; }
  .marks .clean{ font-style:italic; color:var(--good); padding-left:0; }

  /* ---- Detail clippings ---- */
  .clippings{ margin-top:46px; border-top:3px double var(--rule); padding-top:8px; }
  .clip-grid{ display:grid; grid-template-columns:repeat(2,1fr); gap:34px; margin-top:22px; }
  @media (max-width:680px){ .clip-grid{ grid-template-columns:1fr; } }
  .clip h4{ font-family:var(--display); font-weight:600; font-size:22px; margin:0 0 4px; }
  .clip .deck{ font-style:italic; color:var(--ink-soft); font-size:14px; margin:0 0 14px; padding-bottom:10px; border-bottom:1px solid var(--hair); }
  .bar{ display:grid; grid-template-columns:1fr auto; gap:8px 12px; align-items:baseline; padding:7px 0; border-bottom:1px dotted var(--hair); }
  .bar .bn{ font-size:15px; }
  .bar .bv{ font-family:var(--mono); font-size:14px; }
  .bar .track{ grid-column:1/-1; height:3px; background:var(--paper2); position:relative; }
  .bar .fill{ position:absolute; left:0; top:0; height:100%; }

  .footer-note{ text-align:center; margin-top:54px; font-family:var(--mono); font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--ink-soft); }
  .cachetag{ color:var(--good); }

  /* ---- Deep review panel ---- */
  .deep{ margin-top:30px; padding:20px; background:var(--paper2); border:1px solid var(--hair); }
  .deep .label{ margin-bottom:6px; }
  .deep p{ margin:0 0 14px; font-size:15px; font-style:italic; color:var(--ink-soft); }
  .deep .row{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  .ghost{ background:transparent; border:1.5px solid var(--ink); color:var(--ink); font-family:var(--mono); font-size:11px; letter-spacing:.16em; text-transform:uppercase; padding:9px 14px; cursor:pointer; transition:.15s; }
  .ghost:hover{ background:var(--ink); color:var(--paper); }
  .ghost:disabled{ opacity:.4; cursor:default; }

  details.raw{ margin-top:36px; border-top:1px solid var(--hair); padding-top:14px; }
  details.raw summary{ font-family:var(--mono); font-size:11px; letter-spacing:.16em; text-transform:uppercase; color:var(--ink-soft); cursor:pointer; }
  details.raw pre{ font-family:var(--mono); font-size:12px; background:var(--paper2); padding:14px; overflow:auto; max-height:340px; margin-top:12px; border:1px solid var(--hair); }
  .err{ color:var(--red); font-style:italic; }
  .hidden{ display:none; }
</style>
</head>
<body>
<div class="wrap">
  <header class="masthead">
    <div class="kicker">No. 1 &middot; The Copyeditor's Desk</div>
    <h1>The Readability <em>Review</em></h1>
    <div class="sub">A standing verdict on the clarity, cadence &amp; candour of your prose</div>
  </header>
  <div class="dateline">
    <span id="dl-date">&mdash;</span>
    <span>Submitted for Editorial Assessment</span>
    <span>Six Languages &middot; Seven Measures</span>
  </div>

  <div class="desk">
    <section class="col-ms">
      <p class="label">The Manuscript</p>
      <div class="ms-frame">
        <textarea id="text" placeholder="Set your words here, and the desk will read them back to you&hellip;"></textarea>
      </div>
      <div class="controls">
        <span class="stat"><b id="words">0</b> words</span>
        <span class="stat"><b id="chars">0</b> chars</span>
        <label class="stat" style="display:flex;gap:8px;align-items:center;">Tongue
          <select id="lang">
            <option value="auto">auto</option>
            <option value="en">English</option>
            <option value="tr">Türkçe</option>
            <option value="es">Español</option>
            <option value="de">Deutsch</option>
            <option value="fr">Français</option>
            <option value="it">Italiano</option>
          </select>
        </label>
      </div>
      <button class="submit" id="go">Submit for Review</button>
    </section>

    <aside class="col-side">
      <p class="label">The Verdict</p>
      <div id="verdict">
        <p class="placeholder">No manuscript has yet crossed the desk. Type your passage and submit it; the editor will return all seven measures in a single pass &mdash; readability, flow, search-fitness, and the unmistakable scent of a machine.</p>
      </div>
    </aside>
  </div>

  <section id="clippings" class="clippings hidden">
    <p class="label">The Detailed Marks</p>
    <div class="clip-grid" id="clipGrid"></div>

    <div class="deep" id="deepPanel">
      <p class="label">A Second Reading &mdash; By Machine Jury</p>
      <p>Empanel a jury of language models to judge whether these words were written by a human. This reading costs money and takes a moment.</p>
      <div class="row">
        <button class="ghost" data-tier="cheap">Cheap Jury &middot; ~$0.01</button>
        <button class="ghost" data-tier="premium">Premium Jury &middot; ~$0.07</button>
        <span class="stat" id="deepStatus"></span>
      </div>
      <div id="deepResult"></div>
    </div>
  </section>

  <details class="raw">
    <summary>The Editor's Longhand &mdash; raw JSON</summary>
    <pre id="raw">—</pre>
  </details>

  <p class="footer-note" id="footnote">readability-mcp &middot; results are cached &mdash; unchanged prose is never re-read</p>
</div>

<script>
var $=function(s){return document.querySelector(s);};
var textEl=$("#text"), verdict=$("#verdict"), raw=$("#raw"),
    clippings=$("#clippings"), clipGrid=$("#clipGrid"), footnote=$("#footnote");

// ---- date line ----
(function(){
  var months=["January","February","March","April","May","June","July","August","September","October","November","December"];
  var d=new Date();
  $("#dl-date").textContent = months[d.getMonth()]+" "+d.getDate()+", "+d.getFullYear();
})();

// ---- live counts ----
function counts(){
  var t=textEl.value;
  $("#chars").textContent=t.length;
  $("#words").textContent=(t.trim().match(/\\S+/g)||[]).length;
}
textEl.addEventListener("input",counts); counts();

// ---- client-side cache: identical prose is never re-sent ----
function hashKey(s){ var h=5381,i=s.length; while(i) h=(h*33)^s.charCodeAt(--i); return (h>>>0).toString(36); }
var clientCache={};      // key -> response data
var lastKey=null;

function esc(s){ return String(s).replace(/[&<>]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;"}[c];}); }
function clr(v){ return v>=70?"var(--good)":v>=45?"var(--mid)":"var(--bad)"; }
function note(v,inv){ var x=inv?100-v:v; return x>=80?"exemplary":x>=65?"sound":x>=45?"serviceable":x>=25?"laboured":"in want of revision"; }

function grade(name,val,inv,extra){
  var shown = Math.round(val);
  var color = clr(inv?100-val:val);
  return '<div class="grade"><div class="gname">'+name+'</div>'+
    '<div class="gnum" style="color:'+color+'">'+shown+'<small>/100</small></div>'+
    '<div class="gnote">'+note(val,inv)+'</div>'+(extra||'')+'</div>';
}

function bars(title,deck,obj){
  if(!obj) return "";
  var rows=Object.keys(obj).filter(function(k){return typeof obj[k]==="number";}).map(function(k){
    var v=obj[k], pct=Math.max(2,Math.min(100,v)), name=k.replace(/_/g," ");
    return '<div class="bar"><span class="bn">'+esc(name)+'</span><span class="bv">'+Math.round(v)+'</span>'+
      '<span class="track"><span class="fill" style="width:'+pct+'%;background:'+clr(v)+'"></span></span></div>';
  });
  if(!rows.length) return "";
  return '<div class="clip"><h4>'+title+'</h4><p class="deck">'+deck+'</p>'+rows.join("")+'</div>';
}

function renderAll(d){
  if(d.error){ verdict.innerHTML='<p class="err">'+esc(d.error)+'</p>'; clippings.classList.add("hidden"); return; }
  var r=d.readability, f=d.flow, s=d.seo, ai=d.ai;
  var human = 100 - (ai.composite_score||0);

  var seal = (typeof s.passed==="boolean") ? '<div class="seal '+(s.passed?'pass':'fail')+'">'+(s.passed?'fit to publish':'send back')+'</div>' : '';

  var html='<div class="grades">'+
    grade("Readability", r.overall_100||0, false)+
    grade("Flow &amp; Cadence", f.overall_100||0, false)+
    grade("Search Fitness", s.overall_100||0, false, seal)+
    grade("Human Voice", human, false, '<div class="gnote">'+(100-human>=50?'reads as machine':'reads as human')+'</div>')+
    '</div>';

  if(s.verdict) html+='<p class="verdict-line">&ldquo;'+esc(s.verdict)+'&rdquo;</p>';

  // Editor's marks = combined suggestions + ai advice
  var marks=[].concat(s.suggestions||[], ai.summary_advice||[]);
  html+='<div class="marks"><h3>The Editor\\'s Marks</h3>';
  if(marks.length){ html+='<ul>'+marks.map(function(m){return '<li>'+esc(m)+'</li>';}).join("")+'</ul>'; }
  else { html+='<p class="clean">Clean copy. The desk found nothing to strike.</p>'; }
  html+='</div>';

  verdict.innerHTML=html;

  // Clippings
  var sigScores={};
  if(ai.signals) Object.keys(ai.signals).forEach(function(k){ var v=ai.signals[k]; if(v&&typeof v.score==="number") sigScores[k]=100-v.score; });
  clipGrid.innerHTML =
    bars("Readability","Formula scores, normalised. Higher reads easier.",r.metrics_100)+
    bars("Flow","Rhythm, lexical range &amp; the glue between clauses.",f.metrics_100)+
    bars("Search Fitness","The flow measures behind the SEO verdict.",(s.breakdown&&s.breakdown.flow_metrics))+
    bars("Human Voice","Per-signal humanity. Higher = less machine-like.",sigScores);
  clippings.classList.remove("hidden");
}

function setFootnote(cached){
  footnote.innerHTML = cached
    ? 'Drawn from the cache <span class="cachetag">&mdash; this prose was already on file</span>'
    : 'readability-mcp &middot; results are cached &mdash; unchanged prose is never re-read';
}

async function review(){
  var text=textEl.value.trim();
  if(!text){ verdict.innerHTML='<p class="err">The desk needs words before it can render a verdict.</p>'; return; }
  var lang=$("#lang").value;
  var key=lang+"|"+hashKey(text);
  lastKey=key;

  if(clientCache[key]){ renderAll(clientCache[key]); raw.textContent=JSON.stringify(clientCache[key],null,2); setFootnote(true); return; }

  var btn=$("#go"); btn.disabled=true; var old=btn.textContent; btn.textContent="Reading\\u2026";
  verdict.innerHTML='<p class="placeholder" style="float:none">The editor is reading&hellip;</p>';
  try{
    var res=await fetch("/api/all",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({text:text,language:lang})});
    var d=await res.json();
    clientCache[key]=d;
    raw.textContent=JSON.stringify(d,null,2);
    renderAll(d);
    setFootnote(res.headers.get("x-cache")==="HIT"||d._cached);
  }catch(e){ verdict.innerHTML='<p class="err">The desk could not be reached: '+esc(e.message)+'</p>'; }
  finally{ btn.disabled=false; btn.textContent=old; }
}
$("#go").addEventListener("click",review);
textEl.addEventListener("keydown",function(e){ if((e.metaKey||e.ctrlKey)&&e.key==="Enter") review(); });

// ---- deep AI jury ----
var deepCache={};
async function deep(tier){
  var text=textEl.value.trim();
  if(!text){ $("#deepStatus").textContent="No manuscript on the desk."; return; }
  var lang=$("#lang").value, key=tier+"|"+lang+"|"+hashKey(text);
  var status=$("#deepStatus"), out=$("#deepResult");
  if(deepCache[key]){ renderDeep(deepCache[key]); status.textContent="(from cache)"; return; }
  document.querySelectorAll(".deep .ghost").forEach(function(b){b.disabled=true;});
  status.textContent="The jury is deliberating\\u2026";
  try{
    var res=await fetch("/api/ai",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({text:text,language:lang,tier:tier})});
    var d=await res.json();
    if(d.error){ status.textContent=""; out.innerHTML='<p class="err">'+esc(d.error)+'</p>'; return; }
    deepCache[key]=d; status.textContent=(res.headers.get("x-cache")==="HIT")?"(from cache)":"";
    renderDeep(d);
  }catch(e){ status.textContent=""; out.innerHTML='<p class="err">'+esc(e.message)+'</p>'; }
  finally{ document.querySelectorAll(".deep .ghost").forEach(function(b){b.disabled=false;}); }
}
function renderDeep(d){
  var human=100-(d.composite_score||0);
  var cost=(typeof d.total_cost_usd==="number")?(' &middot; cost $'+d.total_cost_usd.toFixed(4)):'';
  var panel=d.signals&&d.signals.llm_panel;
  var agree=panel?(' &middot; agreement: '+esc(panel.agreement||"?")):'';
  var html='<div class="grades" style="margin-top:16px"><div class="grade" style="border-right:1px solid var(--hair)">'+
    '<div class="gname">Composite</div><div class="gnum" style="color:'+clr(human)+'">'+Math.round(human)+'<small>/100 human</small></div>'+
    '<div class="gnote">'+esc(d.verdict||"")+cost+agree+'</div></div>'+
    '<div class="grade"><div class="gname">Heuristic</div><div class="gnum">'+Math.round(100-(d.heuristic_score||0))+'<small>/100</small></div></div></div>';
  if(panel&&panel.consensus_reasons&&panel.consensus_reasons.length){
    html+='<div class="marks"><h3>Jury Consensus</h3><ul>'+panel.consensus_reasons.map(function(c){return '<li>'+esc(typeof c==="string"?c:(c.reason||JSON.stringify(c)))+'</li>';}).join("")+'</ul></div>';
  }
  $("#deepResult").innerHTML=html;
}
document.querySelectorAll(".deep .ghost").forEach(function(b){ b.addEventListener("click",function(){deep(b.dataset.tier);}); });
</script>
</body>
</html>`;
}
