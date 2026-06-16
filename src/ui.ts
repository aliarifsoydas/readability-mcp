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
  .uitoggle{ display:flex; gap:2px; letter-spacing:0; }
  .uitoggle button{
    background:transparent; border:none; cursor:pointer; font-family:var(--mono); font-size:12px;
    letter-spacing:.1em; color:var(--ink-soft); padding:4px 8px; border-bottom:2px solid transparent;
  }
  .uitoggle button.active{ color:var(--red); border-bottom-color:var(--red); }
  .uitoggle button:hover{ color:var(--ink); }

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
    font-family:var(--mono); font-size:14px; letter-spacing:.02em; color:var(--ink);
    padding:4px 24px 4px 2px; cursor:pointer;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23211c14'/%3E%3C/svg%3E");
    background-repeat:no-repeat; background-position:right 2px center;
  }
  .submit{
    margin-top:26px; width:100%; background:var(--ink); color:var(--paper); border:none; cursor:pointer;
    font-family:var(--display); font-weight:600; font-size:20px; letter-spacing:.01em; padding:16px;
    display:flex; align-items:center; justify-content:center; gap:10px; transition:background .18s;
  }
  .submit::after{ content:"\\2192"; font-size:22px; }
  .submit:hover{ background:var(--red); }
  .submit:disabled{ opacity:.45; cursor:wait; }
  .submit:disabled::after{ content:""; }

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
  .ghost{ background:#fff; border:1.5px solid var(--ink); color:var(--ink); font-family:var(--mono); font-size:14px; letter-spacing:.01em; padding:11px 18px; cursor:pointer; transition:.15s; }
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
    <div class="kicker" id="k-kicker"></div>
    <h1 id="k-title"></h1>
    <div class="sub" id="k-sub"></div>
  </header>
  <div class="dateline">
    <span id="dl-date">&mdash;</span>
    <span id="k-dlmid"></span>
    <div class="uitoggle" id="uitoggle">
      <button data-ui="en">EN</button>
      <button data-ui="tr">TR</button>
    </div>
  </div>

  <div class="desk">
    <section class="col-ms">
      <p class="label" id="k-lblms"></p>
      <div class="ms-frame">
        <textarea id="text"></textarea>
      </div>
      <div class="controls">
        <span class="stat"><b id="words">0</b> <span id="k-uwords"></span></span>
        <span class="stat"><b id="chars">0</b> <span id="k-uchars"></span></span>
        <label class="stat" style="display:flex;gap:8px;align-items:center;"><span id="k-tongue"></span>
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
      <button class="submit" id="go"></button>
    </section>

    <aside class="col-side">
      <p class="label" id="k-lblverdict"></p>
      <div id="verdict"></div>
    </aside>
  </div>

  <section id="clippings" class="clippings hidden">
    <p class="label" id="k-lblclip"></p>
    <div class="clip-grid" id="clipGrid"></div>

    <div class="deep" id="deepPanel">
      <p class="label" id="k-lbldeep"></p>
      <p id="k-deepintro"></p>
      <div class="row">
        <button class="ghost" data-tier="cheap"></button>
        <button class="ghost" data-tier="premium"></button>
        <span class="stat" id="deepStatus"></span>
      </div>
      <div id="deepResult"></div>
    </div>
  </section>

  <details class="raw">
    <summary id="k-rawsum"></summary>
    <pre id="raw">—</pre>
  </details>

  <p class="footer-note" id="footnote"></p>
</div>

<script>
var $=function(s){return document.querySelector(s);};
var textEl=$("#text"), verdict=$("#verdict"), raw=$("#raw"),
    clippings=$("#clippings"), clipGrid=$("#clipGrid"), footnote=$("#footnote"), langSel=$("#lang");

// ============ i18n ============
var T={
  en:{
    kicker:"No. 1 &middot; The Copyeditor's Desk",
    title:"The Readability <em>Review</em>",
    sub:"A standing verdict on the clarity, cadence &amp; candour of your prose",
    dlmid:"Submitted for Editorial Assessment",
    lblms:"The Manuscript",
    placeholderMs:"Set your words here, and the desk will read them back to you\\u2026",
    uwords:"words", uchars:"chars", tongue:"Text language",
    submit:"Submit for Review",
    lblverdict:"The Verdict",
    verdictEmpty:"No manuscript has yet crossed the desk. Type your passage and submit it; the editor will return all seven measures in a single pass \\u2014 readability, flow, search-fitness, and the unmistakable scent of a machine.",
    lblclip:"The Detailed Marks",
    lbldeep:"A Second Reading \\u2014 By Machine Jury",
    deepintro:"Empanel a jury of language models to judge whether these words were written by a human. This reading costs money and takes a moment.",
    cheap:"Cheap Jury \\u00b7 ~$0.01", premium:"Premium Jury \\u00b7 ~$0.07",
    rawsum:"The Editor's Longhand \\u2014 raw JSON",
    grades:{read:"Readability", flow:"Flow &amp; Cadence", seo:"Search Fitness", human:"Human Voice"},
    notes:["exemplary","sound","serviceable","laboured","in want of revision"],
    sealPass:"fit to publish", sealFail:"send back",
    machine:"reads as machine", humanlike:"reads as human",
    marksTitle:"The Editor's Marks", clean:"Clean copy. The desk found nothing to strike.",
    decks:{read:"Formula scores, normalised. Higher reads easier.", flow:"Rhythm, lexical range &amp; the glue between clauses.", seo:"The flow measures behind the SEO verdict.", human:"Per-signal humanity. Higher = less machine-like."},
    juryTitle:"Jury Consensus", composite:"Composite", heuristic:"Heuristic",
    humanUnit:"/100 human", agreement:"agreement", cost:"cost",
    footDefault:"readability-mcp &middot; results are cached \\u2014 unchanged prose is never re-read",
    footCached:'Drawn from the cache <span class="cachetag">&mdash; this prose was already on file</span>',
    errWords:"The desk needs words before it can render a verdict.",
    busy:"Reading\\u2026", reading:"The editor is reading\\u2026", unreachable:"The desk could not be reached: ",
    deepNoMs:"No manuscript on the desk.", deliberating:"The jury is deliberating\\u2026", fromCache:"(from cache)"
  },
  tr:{
    kicker:"Say\\u0131 1 &middot; Redaksiyon Masas\\u0131",
    title:"Okunabilirlik <em>Rev\\u00fcs\\u00fc</em>",
    sub:"D\\u00fczyaz\\u0131n\\u0131z\\u0131n berrakl\\u0131\\u011f\\u0131, ritmi ve samimiyeti \\u00fczerine bir karar",
    dlmid:"Edit\\u00f6ryal De\\u011ferlendirmeye Sunulur",
    lblms:"M\\u00fcsvedde",
    placeholderMs:"S\\u00f6zc\\u00fcklerinizi buraya b\\u0131rak\\u0131n; masa onlar\\u0131 size geri okusun\\u2026",
    uwords:"kelime", uchars:"karakter", tongue:"Metin dili",
    submit:"\\u0130ncelemeye G\\u00f6nder",
    lblverdict:"Karar",
    verdictEmpty:"Hen\\u00fcz masaya bir m\\u00fcsvedde gelmedi. Metninizi yaz\\u0131p g\\u00f6nderin; edit\\u00f6r yedi \\u00f6l\\u00e7\\u00fct\\u00fc tek seferde d\\u00f6nd\\u00fcrs\\u00fcn \\u2014 okunabilirlik, ak\\u0131\\u015f, arama uyumu ve makinenin o belli belirsiz kokusu.",
    lblclip:"Ayr\\u0131nt\\u0131l\\u0131 Notlar",
    lbldeep:"\\u0130kinci Okuma \\u2014 Makine J\\u00fcrisi",
    deepintro:"Bu s\\u00f6zc\\u00fcklerin bir insan taraf\\u0131ndan yaz\\u0131l\\u0131p yaz\\u0131lmad\\u0131\\u011f\\u0131na karar vermesi i\\u00e7in bir dil modeli j\\u00fcrisi toplay\\u0131n. Bu okuma \\u00fccretlidir ve biraz zaman al\\u0131r.",
    cheap:"Ekonomik J\\u00fcri \\u00b7 ~$0.01", premium:"Premium J\\u00fcri \\u00b7 ~$0.07",
    rawsum:"Edit\\u00f6r\\u00fcn El Yaz\\u0131s\\u0131 \\u2014 ham JSON",
    grades:{read:"Okunabilirlik", flow:"Ak\\u0131\\u015f ve Ritim", seo:"Arama Uyumu", human:"\\u0130nsan Sesi"},
    notes:["kusursuz","sa\\u011flam","idare eder","zorlama","elden ge\\u00e7meli"],
    sealPass:"yay\\u0131na uygun", sealFail:"geri g\\u00f6nder",
    machine:"makine gibi", humanlike:"insan gibi",
    marksTitle:"Edit\\u00f6r\\u00fcn Notlar\\u0131", clean:"Temiz metin. Masa silecek bir \\u015fey bulamad\\u0131.",
    decks:{read:"Form\\u00fcl skorlar\\u0131, normalize. Y\\u00fcksek = daha kolay okunur.", flow:"Ritim, s\\u00f6zc\\u00fck \\u00e7e\\u015fitlili\\u011fi ve c\\u00fcmleler aras\\u0131 ba\\u011f.", seo:"SEO karar\\u0131n\\u0131n arkas\\u0131ndaki ak\\u0131\\u015f \\u00f6l\\u00e7\\u00fctleri.", human:"Sinyal ba\\u015f\\u0131na insanl\\u0131k. Y\\u00fcksek = daha az makine."},
    juryTitle:"J\\u00fcri Mutabakat\\u0131", composite:"Bile\\u015fik", heuristic:"Sezgisel",
    humanUnit:"/100 insan", agreement:"uzla\\u015f\\u0131", cost:"maliyet",
    footDefault:"readability-mcp &middot; sonu\\u00e7lar \\u00f6nbelle\\u011fe al\\u0131n\\u0131r \\u2014 de\\u011fi\\u015fmeyen metin tekrar okunmaz",
    footCached:'\\u00d6nbellekten al\\u0131nd\\u0131 <span class="cachetag">&mdash; bu metin zaten dosyada</span>',
    errWords:"Karar vermesi i\\u00e7in masaya \\u00f6nce s\\u00f6zc\\u00fck laz\\u0131m.",
    busy:"Okunuyor\\u2026", reading:"Edit\\u00f6r okuyor\\u2026", unreachable:"Masaya ula\\u015f\\u0131lamad\\u0131: ",
    deepNoMs:"Masada m\\u00fcsvedde yok.", deliberating:"J\\u00fcri m\\u00fczakere ediyor\\u2026", fromCache:"(\\u00f6nbellekten)"
  }
};
var ui = (navigator.language||"en").toLowerCase().indexOf("tr")===0 ? "tr" : "en";
function t(){ return T[ui]; }

function applyI18n(){
  var x=t();
  document.documentElement.lang = ui;
  $("#k-kicker").innerHTML=x.kicker;
  $("#k-title").innerHTML=x.title;
  $("#k-sub").innerHTML=x.sub;
  $("#k-dlmid").textContent=x.dlmid;
  $("#k-lblms").textContent=x.lblms;
  textEl.placeholder=x.placeholderMs;
  $("#k-uwords").textContent=x.uwords;
  $("#k-uchars").textContent=x.uchars;
  $("#k-tongue").textContent=x.tongue;
  $("#go").textContent=x.submit;
  $("#k-lblverdict").textContent=x.lblverdict;
  $("#k-lblclip").textContent=x.lblclip;
  $("#k-lbldeep").textContent=x.lbldeep;
  $("#k-deepintro").textContent=x.deepintro;
  document.querySelector('.ghost[data-tier="cheap"]').innerHTML=x.cheap;
  document.querySelector('.ghost[data-tier="premium"]').innerHTML=x.premium;
  $("#k-rawsum").textContent=x.rawsum;
  document.querySelectorAll("#uitoggle button").forEach(function(b){ b.classList.toggle("active", b.dataset.ui===ui); });
  if(!window.__lastAll){ verdict.innerHTML='<p class="placeholder">'+x.verdictEmpty+'</p>'; }
  else { renderAll(window.__lastAll); }
  if(window.__lastDeep){ renderDeep(window.__lastDeep); }
  setFootnote(window.__lastCached);
}

// ---- date line ----
(function(){
  var months=["January","February","March","April","May","June","July","August","September","October","November","December"];
  var d=new Date();
  $("#dl-date").textContent = months[d.getMonth()]+" "+d.getDate()+", "+d.getFullYear();
})();

// ---- live counts ----
function counts(){
  var tx=textEl.value;
  $("#chars").textContent=tx.length;
  $("#words").textContent=(tx.trim().match(/\\S+/g)||[]).length;
}
textEl.addEventListener("input",counts);

// ---- client-side cache: identical prose is never re-sent ----
function hashKey(s){ var h=5381,i=s.length; while(i) h=(h*33)^s.charCodeAt(--i); return (h>>>0).toString(36); }
var clientCache={};
function esc(s){ return String(s).replace(/[&<>]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;"}[c];}); }
function clr(v){ return v>=70?"var(--good)":v>=45?"var(--mid)":"var(--bad)"; }
function noteFor(v,inv){ var x=inv?100-v:v; var n=t().notes; return x>=80?n[0]:x>=65?n[1]:x>=45?n[2]:x>=25?n[3]:n[4]; }

function grade(name,val,extra){
  var color = clr(val);
  return '<div class="grade"><div class="gname">'+name+'</div>'+
    '<div class="gnum" style="color:'+color+'">'+Math.round(val)+'<small>/100</small></div>'+
    '<div class="gnote">'+noteFor(val)+'</div>'+(extra||'')+'</div>';
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
  var x=t();
  if(d.error){ verdict.innerHTML='<p class="err">'+esc(d.error)+'</p>'; clippings.classList.add("hidden"); return; }
  var r=d.readability, f=d.flow, s=d.seo, ai=d.ai;
  var human = 100 - (ai.composite_score||0);

  var seal = (typeof s.passed==="boolean") ? '<div class="seal '+(s.passed?'pass':'fail')+'">'+(s.passed?x.sealPass:x.sealFail)+'</div>' : '';
  var humanNote = '<div class="gnote">'+(human<50?x.machine:x.humanlike)+'</div>';

  var html='<div class="grades">'+
    grade(x.grades.read, r.overall_100||0)+
    grade(x.grades.flow, f.overall_100||0)+
    grade(x.grades.seo, s.overall_100||0, seal)+
    grade(x.grades.human, human, humanNote)+
    '</div>';

  if(s.verdict) html+='<p class="verdict-line">&ldquo;'+esc(s.verdict)+'&rdquo;</p>';

  var marks=[].concat(s.suggestions||[], ai.summary_advice||[]);
  html+='<div class="marks"><h3>'+x.marksTitle+'</h3>';
  if(marks.length){ html+='<ul>'+marks.map(function(m){return '<li>'+esc(m)+'</li>';}).join("")+'</ul>'; }
  else { html+='<p class="clean">'+x.clean+'</p>'; }
  html+='</div>';
  verdict.innerHTML=html;

  var sigScores={};
  if(ai.signals) Object.keys(ai.signals).forEach(function(k){ var v=ai.signals[k]; if(v&&typeof v.score==="number") sigScores[k]=100-v.score; });
  clipGrid.innerHTML =
    bars(x.grades.read,x.decks.read,r.metrics_100)+
    bars(x.grades.flow,x.decks.flow,f.metrics_100)+
    bars(x.grades.seo,x.decks.seo,(s.breakdown&&s.breakdown.flow_metrics))+
    bars(x.grades.human,x.decks.human,sigScores);
  clippings.classList.remove("hidden");
}

function setFootnote(cached){
  window.__lastCached=cached;
  footnote.innerHTML = cached ? t().footCached : t().footDefault;
}

async function review(){
  var x=t();
  var text=textEl.value.trim();
  if(!text){ verdict.innerHTML='<p class="err">'+x.errWords+'</p>'; return; }
  var lang=langSel.value;
  var key=lang+"|"+hashKey(text);

  if(clientCache[key]){ window.__lastAll=clientCache[key]; renderAll(clientCache[key]); raw.textContent=JSON.stringify(clientCache[key],null,2); setFootnote(true); return; }

  var btn=$("#go"); btn.disabled=true; btn.textContent=x.busy;
  verdict.innerHTML='<p class="placeholder" style="float:none">'+x.reading+'</p>';
  try{
    var res=await fetch("/api/all",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({text:text,language:lang})});
    var d=await res.json();
    clientCache[key]=d; window.__lastAll=d;
    raw.textContent=JSON.stringify(d,null,2);
    renderAll(d);
    setFootnote(res.headers.get("x-cache")==="HIT"||d._cached);
  }catch(e){ verdict.innerHTML='<p class="err">'+x.unreachable+esc(e.message)+'</p>'; }
  finally{ btn.disabled=false; btn.textContent=x.submit; }
}
$("#go").addEventListener("click",review);
textEl.addEventListener("keydown",function(e){ if((e.metaKey||e.ctrlKey)&&e.key==="Enter") review(); });

// ---- deep AI jury ----
var deepCache={};
async function deep(tier){
  var x=t();
  var text=textEl.value.trim();
  if(!text){ $("#deepStatus").textContent=x.deepNoMs; return; }
  var lang=langSel.value, key=tier+"|"+lang+"|"+hashKey(text);
  var status=$("#deepStatus"), out=$("#deepResult");
  if(deepCache[key]){ window.__lastDeep=deepCache[key]; renderDeep(deepCache[key]); status.textContent=x.fromCache; return; }
  document.querySelectorAll(".deep .ghost").forEach(function(b){b.disabled=true;});
  status.textContent=x.deliberating;
  try{
    var res=await fetch("/api/ai",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({text:text,language:lang,tier:tier})});
    var d=await res.json();
    if(d.error){ status.textContent=""; out.innerHTML='<p class="err">'+esc(d.error)+'</p>'; return; }
    deepCache[key]=d; window.__lastDeep=d; status.textContent=(res.headers.get("x-cache")==="HIT")?x.fromCache:"";
    renderDeep(d);
  }catch(e){ status.textContent=""; out.innerHTML='<p class="err">'+esc(e.message)+'</p>'; }
  finally{ document.querySelectorAll(".deep .ghost").forEach(function(b){b.disabled=false;}); }
}
function renderDeep(d){
  var x=t();
  var human=100-(d.composite_score||0);
  var cost=(typeof d.total_cost_usd==="number")?(' &middot; '+x.cost+' $'+d.total_cost_usd.toFixed(4)):'';
  var panel=d.signals&&d.signals.llm_panel;
  var agree=panel?(' &middot; '+x.agreement+': '+esc(panel.agreement||"?")):'';
  var html='<div class="grades" style="margin-top:16px"><div class="grade" style="border-right:1px solid var(--hair)">'+
    '<div class="gname">'+x.composite+'</div><div class="gnum" style="color:'+clr(human)+'">'+Math.round(human)+'<small>'+x.humanUnit+'</small></div>'+
    '<div class="gnote">'+esc(d.verdict||"")+cost+agree+'</div></div>'+
    '<div class="grade"><div class="gname">'+x.heuristic+'</div><div class="gnum">'+Math.round(100-(d.heuristic_score||0))+'<small>/100</small></div></div></div>';
  if(panel&&panel.consensus_reasons&&panel.consensus_reasons.length){
    html+='<div class="marks"><h3>'+x.juryTitle+'</h3><ul>'+panel.consensus_reasons.map(function(c){return '<li>'+esc(typeof c==="string"?c:(c.reason||JSON.stringify(c)))+'</li>';}).join("")+'</ul></div>';
  }
  $("#deepResult").innerHTML=html;
}
document.querySelectorAll(".deep .ghost").forEach(function(b){ b.addEventListener("click",function(){deep(b.dataset.tier);}); });

// ---- UI language toggle: switches chrome AND re-fetches output in that language ----
document.querySelectorAll("#uitoggle button").forEach(function(b){
  b.addEventListener("click",function(){
    if(ui===b.dataset.ui) return;
    ui=b.dataset.ui;
    langSel.value=ui;                 // keep analysis language in step with the UI
    applyI18n();
    if(window.__lastAll) review();    // re-read so backend verdict/advice switch language too
  });
});

// ---- boot ----
counts();
applyI18n();
</script>
</body>
</html>`;
}
