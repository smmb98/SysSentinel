'use strict';

const { APP_NAME, PORT } = require('../config');

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="description" content="SysSentinel system health monitor. Local only, no data leaves your PC." />
<meta name="color-scheme" content="dark" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235b8dee' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z'/%3E%3Cpath d='M9 12l2 2 4-4'/%3E%3C/svg%3E" />
<title>${APP_NAME} — System Health</title>
<style>
  :root{
    --bg:#0a0e14; --panel:#111824; --panel2:#0d131c; --border:#1d2836;
    --border2:#2b3a4d; --text:#e8eef5; --muted:#94a3b3; --faint:#61758a;
    --green:#41c58a; --orange:#e0a458; --red:#e05d5d; --blue:#5b8dee;
    --shadow:0 1px 2px rgba(4,9,16,.4), 0 14px 36px -14px rgba(18,34,64,.5);
    --font-sans:"Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,"Helvetica Neue",sans-serif;
    --font-display:"Bahnschrift","Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;
    --font-mono:"Cascadia Mono","Cascadia Code","Consolas",ui-monospace,monospace;
  }
  *{box-sizing:border-box; margin:0; padding:0;}
  html{scroll-behavior:smooth;}
  body{
    font-family:var(--font-sans); font-size:14px; line-height:1.55;
    background:var(--bg); color:var(--text); min-height:100vh;
  }
  body::before{
    content:""; position:fixed; inset:0; z-index:-1; pointer-events:none;
    background:
      radial-gradient(1100px 520px at 85% -10%, rgba(91,141,238,.07), transparent 60%),
      radial-gradient(900px 480px at -15% 110%, rgba(65,197,138,.05), transparent 60%),
      var(--bg);
  }
  a:focus-visible, button:focus-visible{
    outline:2px solid var(--blue); outline-offset:2px; border-radius:8px;
  }
  .wrap{max-width:1120px; margin:0 auto; padding:28px 24px 40px;}
  .skip{position:absolute; left:-999px; top:8px; padding:10px 16px; background:var(--panel);
    border:1px solid var(--border2); border-radius:8px; color:var(--text); text-decoration:none;}
  .skip:focus{left:8px; z-index:60;}

  header{display:flex; align-items:center; gap:14px; margin-bottom:26px;}
  .logo{
    width:42px; height:42px; flex:0 0 auto; border-radius:11px;
    background:linear-gradient(180deg,#182234,#101826);
    border:1px solid var(--border2); display:flex; align-items:center;
    justify-content:center; color:var(--blue); box-shadow:var(--shadow);
  }
  .logo svg{width:22px; height:22px;}
  .brand h1{font-family:var(--font-display); font-size:21px; font-weight:600;
    letter-spacing:-.01em; display:flex; align-items:center; gap:10px;}
  .sub{color:var(--muted); font-size:12.5px; margin-top:3px; min-height:17px;}
  .meta{margin-left:auto; display:flex; align-items:center; gap:10px; color:var(--faint);
    font-size:11px; letter-spacing:.08em; text-transform:uppercase; text-align:right;}
  .meta b{color:var(--muted); font-weight:600;}
  .live{display:inline-flex; align-items:center; gap:6px; font-family:var(--font-mono);
    font-size:10.5px; letter-spacing:.12em; color:var(--green);
    background:rgba(65,197,138,.09); border:1px solid rgba(65,197,138,.38);
    padding:3px 9px; border-radius:20px; font-weight:600; vertical-align:2px;}
  .live .pd{width:6px; height:6px; border-radius:50%; background:currentColor; animation:pulse 2s infinite;}
  .live.live-off{color:var(--orange); background:rgba(224,164,88,.09); border-color:rgba(224,164,88,.38);}
  .live.live-off .pd{animation:none;}
  @keyframes pulse{50%{opacity:.3;}}

  .grid{display:grid; grid-template-columns:1.18fr .82fr; gap:18px; align-items:start;}
  .card{background:linear-gradient(180deg,#131c2a,#101827); border:1px solid var(--border);
    border-radius:16px; padding:22px; box-shadow:var(--shadow);}
  .card h3{font-size:11px; text-transform:uppercase; letter-spacing:.14em; color:var(--muted);
    font-weight:600; margin-bottom:18px; display:flex; align-items:center; gap:8px;}
  .card h3 svg{width:14px; height:14px; color:var(--faint);}
  .health{display:flex; align-items:center; gap:18px;}
  .dot{position:relative; width:22px; height:22px; border-radius:50%; flex:0 0 auto; background:var(--faint);}
  .dot::after{content:""; position:absolute; inset:4px; border-radius:50%;
    background:radial-gradient(circle at 35% 30%, rgba(255,255,255,.35), transparent 55%);}
  .dot.normal{background:var(--green); box-shadow:0 0 0 6px rgba(65,197,138,.1), 0 0 26px rgba(65,197,138,.45);}
  .dot.warning{background:var(--orange); box-shadow:0 0 0 6px rgba(224,164,88,.1), 0 0 26px rgba(224,164,88,.45);}
  .dot.critical{background:var(--red); box-shadow:0 0 0 6px rgba(224,93,93,.12), 0 0 28px rgba(224,93,93,.5); animation:blink 1s infinite;}
  .dot.off{background:var(--faint); box-shadow:0 0 0 6px rgba(97,117,138,.08);}
  @keyframes blink{50%{opacity:.55;}}
  .health-title{font-family:var(--font-display); font-size:19px; font-weight:600; letter-spacing:-.01em;}
  .health-sub{color:var(--muted); font-size:13px; margin-top:3px;}
  .metrics{display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:22px;}
  .metric .value{font-family:var(--font-mono); font-size:22px; font-weight:600;
    font-variant-numeric:tabular-nums; letter-spacing:-.02em;}
  .metric .label{color:var(--muted); font-size:11.5px; margin-top:2px; letter-spacing:.02em;}
  .bar{height:6px; background:var(--panel2); border:1px solid rgba(255,255,255,.04);
    border-radius:4px; overflow:hidden; margin-top:10px;}
  .bar>span{display:block; height:100%; border-radius:4px;
    transition:width .6s cubic-bezier(.22,1,.36,1), background .4s ease;}
  body.syncing .metric .value{color:var(--faint);}
  body.syncing .bar>span{background:linear-gradient(90deg,#1c2938,#2a3b52,#1c2938);
    background-size:200% 100%; animation:shimmer 1.2s infinite linear;}
  @keyframes shimmer{to{background-position:-200% 0;}}
  .proc-info{margin-top:18px; border-top:1px solid var(--border); padding-top:16px; font-size:13.5px;}
  .proc-info b{font-weight:600; color:var(--text);}
  .proc-info .muted{color:var(--muted);}
  .proc-info .num{font-family:var(--font-mono); font-variant-numeric:tabular-nums; color:var(--text);}

  .feedcard{min-height:322px;}
  .feed{display:flex; flex-direction:column; gap:12px; max-height:420px; overflow-y:auto;
    padding-right:4px; overscroll-behavior:contain;}
  .feed::-webkit-scrollbar{width:8px;}
  .feed::-webkit-scrollbar-thumb{background:var(--border2); border-radius:4px;}
  .feed::-webkit-scrollbar-track{background:transparent;}
  .anomaly{display:flex; gap:13px; padding:14px; border-left:3px solid var(--orange);
    background:linear-gradient(90deg, rgba(224,164,88,.06), transparent 50%);
    border-radius:0 12px 12px 0; animation:slide .35s cubic-bezier(.22,1,.36,1);}
  .anomaly.critical{border-left-color:var(--red);
    background:linear-gradient(90deg, rgba(224,93,93,.07), transparent 50%);}
  .anomaly.new{outline:1px solid rgba(224,164,88,.5); outline-offset:2px;}
  .anomaly.critical.new{outline-color:rgba(224,93,93,.55);}
  @keyframes slide{from{opacity:0; transform:translateY(-6px);} to{opacity:1; transform:none;}}
  .anomaly .ico{width:32px; height:32px; flex:0 0 auto; color:var(--orange);
    background:rgba(224,164,88,.1); border-radius:9px; padding:6px; border:1px solid rgba(224,164,88,.22);}
  .anomaly.critical .ico{color:var(--red); background:rgba(224,93,93,.1); border-color:rgba(224,93,93,.24);}
  .anomaly .t{font-weight:600; font-size:13.5px;}
  .anomaly .d{color:var(--muted); font-size:12.5px; margin-top:3px;}
  .anomaly .time{color:var(--faint); font-family:var(--font-mono); font-size:11px;
    font-variant-numeric:tabular-nums; margin-top:8px;}
  .empty{display:flex; flex-direction:column; align-items:center; justify-content:center;
    min-height:250px; text-align:center; color:var(--muted); font-size:13.5px;}
  .empty .ring{position:relative; width:46px; height:46px; border:2px solid var(--border2);
    border-radius:50%; margin-bottom:14px;}
  .empty .ring::after{content:""; position:absolute; inset:11px; border-radius:50%;
    background:var(--green); box-shadow:0 0 16px rgba(65,197,138,.55);}
  .empty .ring::before{content:""; position:absolute; inset:-2px; border-radius:50%;
    border:2px solid transparent; border-top-color:var(--green); animation:orbit 1.8s linear infinite;}
  @keyframes orbit{to{transform:rotate(360deg);}}
  .empty b{color:var(--text); font-weight:600;}

  .actions{display:flex; flex-wrap:wrap; gap:12px; margin-top:22px;}
  .btn{appearance:none; cursor:pointer; display:inline-flex; align-items:center; gap:8px;
    border:1px solid var(--border2); background:var(--panel); color:var(--text);
    padding:11px 16px; border-radius:10px; font-family:var(--font-sans);
    font-size:13.5px; font-weight:500; transition:transform .12s ease, background .15s ease,
    border-color .15s ease, box-shadow .15s ease;}
  .btn svg{width:15px; height:15px; opacity:.85;}
  .btn:hover{background:#1a2434; border-color:#34506e; transform:translateY(-1px);}
  .btn:active{transform:translateY(0) scale(.98);}
  .btn.primary{background:linear-gradient(180deg,#6a9af2,#4f7fe0); border-color:rgba(91,141,238,.7);
    color:#0b111c; font-weight:600;}
  .btn.primary:hover{background:linear-gradient(180deg,#7ba7f5,#5b8dee); border-color:var(--blue);
    box-shadow:0 6px 20px -8px rgba(91,141,238,.6);}
  .btn.danger{background:transparent; border-color:rgba(224,93,93,.45); color:var(--red);}
  .btn.danger:hover{background:rgba(224,93,93,.1); border-color:var(--red);}
  .btn:disabled{opacity:.6; cursor:not-allowed; transform:none;}
  .spin{display:inline-block; width:13px; height:13px; border:2px solid currentColor;
    border-right-color:transparent; border-radius:50%; animation:spin .8s linear infinite; vertical-align:-2px;}
  @keyframes spin{to{transform:rotate(360deg);}}

  footer{color:var(--faint); font-size:12px; margin-top:30px; border-top:1px solid var(--border);
    padding-top:18px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;}
  footer .footer-live{margin-left:auto;}
  footer .live{align-self:center;}

  .modal{display:none; position:fixed; inset:0; background:rgba(5,9,15,.72);
    backdrop-filter:blur(3px); align-items:center; justify-content:center; z-index:50; padding:20px;}
  .modal.show{display:flex; animation:fade .18s ease;}
  @keyframes fade{from{opacity:0;} to{opacity:1;}}
  .modal-card{background:linear-gradient(180deg,#141e2e,#101827); border:1px solid var(--border2);
    border-radius:16px; max-width:540px; width:100%; padding:26px; box-shadow:0 24px 60px -20px rgba(0,0,0,.6);
    animation:rise .22s cubic-bezier(.22,1,.36,1); max-height:80vh; overflow:auto;}
  @keyframes rise{from{opacity:0; transform:translateY(10px);} to{opacity:1; transform:none;}}
  .modal-card h2{font-family:var(--font-display); font-size:19px; font-weight:600; margin-bottom:12px;}
  .modal-card p{color:var(--muted); font-size:13.5px; line-height:1.65;}
  .modal-card ul{margin:12px 0 6px 18px; color:var(--muted); font-size:13.5px; line-height:1.85;}
  .modal-card code{font-family:var(--font-mono); font-size:12px; color:var(--text);
    background:var(--panel2); border:1px solid var(--border); padding:1px 5px; border-radius:5px;}
  .modal-card pre{font-family:var(--font-mono); font-size:12px; line-height:1.6; color:#b9c7d6;
    background:var(--panel2); border:1px solid var(--border); border-radius:10px; padding:14px;
    max-height:50vh; overflow:auto; white-space:pre-wrap; word-break:break-word;}
  .modal-card .row{display:flex; gap:12px; justify-content:flex-end; margin-top:22px;}

  @media (max-width:860px){
    .grid{grid-template-columns:1fr;}
    .meta{display:none;}
    .wrap{padding:20px 16px 32px;}
  }
  @media (prefers-reduced-motion: reduce){
    *, *::before, *::after{animation-duration:.001s !important; transition-duration:.001s !important;}
    html{scroll-behavior:auto;}
  }
</style>
</head>
<body class="syncing">
<a class="skip" href="#main">Skip to content</a>
<div class="wrap">
<header>
  <div class="logo" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>
  </div>
  <div class="brand">
    <h1>${APP_NAME}<span class="live live-off" id="liveBadge" style="display:none"><span class="pd"></span><span id="liveTxt">LIVE</span></span></h1>
    <div class="sub" id="statusline" role="status" aria-live="polite">Connecting…</div>
  </div>
  <div class="meta"><b>LOCAL ONLY</b><span>·</span>127.0.0.1:${PORT}</div>
</header>

<main id="main">
  <div class="grid">
    <div class="card">
      <h3><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 1 18 0 9 9 0 0 1-18 0z"/><path d="M12 7v5l3 2"/></svg>System Health</h3>
      <div class="health">
        <div class="dot off" id="dot" aria-hidden="true"></div>
        <div>
          <div class="health-title" id="healthTitle">Checking…</div>
          <div class="health-sub" id="healthSub">Waiting for first sample</div>
        </div>
      </div>
      <div class="metrics">
        <div class="metric">
          <div class="value" id="cpuVal">—</div>
          <div class="label">CPU Load</div>
          <div class="bar"><span id="cpuBar" style="width:0%"></span></div>
        </div>
        <div class="metric">
          <div class="value" id="ramVal">—</div>
          <div class="label">RAM Free</div>
          <div class="bar"><span id="ramBar" style="width:0%"></span></div>
        </div>
      </div>
      <div class="proc-info">
        <b>Top process:</b> <span id="topProc">Scanning…</span>
      </div>
    </div>

    <div class="card feedcard">
      <h3><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-9-3.5M6 8a6 6 0 0 1 9-3.5"/><path d="M12 12l6 6"/><path d="M12 12l6-6"/><path d="M8 15h.01M17 5h.01"/></svg>Active Anomaly Feed</h3>
      <div class="feed" id="feed" aria-live="polite">
        <div class="empty"><div class="ring" aria-hidden="true"></div>
          <div><b>All clear</b> — no anomalies detected yet.<br/>SysSentinel keeps watching for unusual activity.</div>
        </div>
      </div>
    </div>

    <div class="card" id="bgCard">
      <h3><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/><circle cx="12" cy="12" r="4"/></svg>Background Monitoring</h3>
      <div class="health">
        <div class="dot off" id="bgDot" aria-hidden="true"></div>
        <div>
          <div class="health-title" id="bgTitle">Checking…</div>
          <div class="health-sub" id="bgSub">Querying Windows Task Scheduler</div>
        </div>
      </div>
      <div class="actions" id="bgActions"></div>
    </div>
  </div>

  <div class="actions">
    <button class="btn" id="refreshBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v5h-5"/></svg>Refresh Status</button>
    <button class="btn" id="historyBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8a9 9 0 1 1-.5 4"/><path d="M3 4v4h4"/><path d="M12 8v4l3 2"/></svg>View History</button>
    <button class="btn danger" id="uninstallBtn" style="display:none"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>Uninstall &amp; Clean Up</button>
  </div>
</main>

<footer>${APP_NAME} — local only. Listens on http://localhost:${PORT} on this machine. No data leaves your PC.
  <span class="footer-live"><span class="live live-off" id="footLive" style="display:none"><span class="pd"></span>LIVE</span></span>
</footer>

<div class="modal" id="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
  <div class="modal-card">
    <h2 id="modalTitle"></h2>
    <div id="modalBody"></div>
    <div class="row" id="modalActions"></div>
  </div>
</div>

<svg style="display:none" aria-hidden="true">
  <symbol id="i-alert" viewBox="0 0 24 24"><path d="M12 3l10 18H2z"/><path d="M12 10v4"/><path d="M12 17h.01"/></symbol>
  <symbol id="i-device" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4"/><path d="M8 20h8"/></symbol>
  <symbol id="i-trend" viewBox="0 0 24 24"><path d="M3 17l5-5 4 4 8-8"/><path d="M15 8h5v5"/></symbol>
  <symbol id="i-play" viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></symbol>
  <symbol id="i-stop" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></symbol>
</svg>

<script>
const $ = (id) => document.getElementById(id);
let feedItems = [];
let isLive = false;
let es = null;
let taskExists = false;

function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function glyph(emoji){
  const id = { '⚠️': 'i-alert', '🖥️': 'i-device', '📈': 'i-trend' }[emoji] || 'i-alert';
  return '<svg class="ico"><use href="#' + id + '"></use></svg>';
}

function setup(){
  $('refreshBtn').onclick = () => fetchStatus(true);
  $('historyBtn').onclick = openHistory;
  $('uninstallBtn').onclick = confirmUninstall;
  $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('modal').classList.contains('show')) closeModal(); });
  connectStream();
  refreshBg();
  setInterval(() => { if (!isLive) fetchStatus(false); }, 5000);
}

async function refreshBg(){
  try{
    const r = await fetch('/api/task-status');
    const d = await r.json();
    taskExists = !!d.taskExists;
  }catch(e){ taskExists = false; }
  renderBg();
}

function renderBg(){
  const dot = $('bgDot'), t = $('bgTitle'), s = $('bgSub'), a = $('bgActions');
  $('uninstallBtn').style.display = taskExists ? '' : 'none';
  dot.className = 'dot ' + (taskExists ? 'normal' : 'off');
  t.textContent = taskExists ? 'Monitoring at startup' : 'Background monitoring is off';
  s.textContent = taskExists
    ? 'SysSentinel is set to start automatically every time you log on.'
    : 'SysSentinel works only while this dashboard is open.';
  a.innerHTML = taskExists
    ? '<button class="btn" id="disableBgBtn"><svg class="ico" style="width:15px;height:15px"><use href="#i-stop"></use></svg> Stop at startup</button>'
    : '<button class="btn" id="enableBgBtn"><svg class="ico" style="width:15px;height:15px"><use href="#i-play"></use></svg> Monitor at startup</button>';
  const eb = $('enableBgBtn'), db = $('disableBgBtn');
  if (eb) eb.onclick = enableBg;
  if (db) db.onclick = disableBg;
}

async function callBg(endpoint){
  try{
    const r = await fetch(endpoint, { method: 'POST' });
    const d = await r.json();
    $('statusline').textContent = d.ok
      ? (d.message || 'Done')
      : 'Could not enable background monitoring — ' + (d.message || 'unknown error');
  }catch(e){
    $('statusline').textContent = 'Background monitoring request failed.';
  }
  await refreshBg();
}

function enableBg(){
  $('bgActions').innerHTML = '<button class="btn" disabled><span class="spin"></span> Enabling…</button>';
  callBg('/api/install-task');
}

function disableBg(){
  $('bgActions').innerHTML = '<button class="btn" disabled><span class="spin"></span> Disabling…</button>';
  callBg('/api/uninstall-task');
}

function setLive(on, reconnecting){
  isLive = on;
  const b = $('liveBadge'), f = $('footLive'), t = $('liveTxt');
  b.style.display = on ? '' : 'none';
  f.style.display = on ? '' : 'none';
  b.classList.toggle('live-off', reconnecting);
  f.classList.toggle('live-off', reconnecting);
  if (t) t.textContent = reconnecting ? 'RECONNECTING' : 'LIVE';
}

function connectStream(){
  function open(){
    if (es) { try { es.close(); } catch(_){} }
    es = new EventSource('/api/stream');
    es.addEventListener('open', () => {
      setLive(true, false);
      $('statusline').textContent = 'Live — streaming system telemetry';
    });
    es.addEventListener('feed', (e) => {
      feedItems = JSON.parse(e.data);
      renderFeed([]);
    });
    es.addEventListener('snapshot', (e) => {
      render(JSON.parse(e.data));
      setLive(true, false);
    });
    es.addEventListener('anomaly', (e) => {
      feedItems.unshift(JSON.parse(e.data));
      if (feedItems.length > 50) feedItems.pop();
      renderFeed([feedItems[0]]);
    });
    es.onerror = () => {
      setLive(false, true);
      $('statusline').textContent = 'Live connection lost — reconnecting…';
      es.close();
      setTimeout(open, 3000);
    };
  }
  open();
}

function barColor(pct){
  if (pct >= 90) return 'var(--red)';
  if (pct >= 80) return 'var(--orange)';
  return 'var(--green)';
}

function render(data){
  document.body.classList.remove('syncing');
  const cpu = Math.round(data.cpu.load);
  const memUsed = data.mem.usedPercent;
  const freeGb = data.mem.freeGb.toFixed(1);
  const totalGb = data.mem.totalGb.toFixed(1);

  $('cpuVal').textContent = cpu + '%';
  $('cpuBar').style.width = cpu + '%';
  $('cpuBar').style.background = barColor(cpu);

  $('ramVal').textContent = freeGb + ' GB / ' + totalGb + ' GB';
  $('ramBar').style.width = Math.min(100, memUsed) + '%';
  $('ramBar').style.background = barColor(memUsed);

  const dot = $('dot');
  dot.className = 'dot ' + data.status;
  $('healthTitle').textContent = ({
    normal: 'All systems normal',
    warning: 'System under strain',
    critical: 'Critical — action recommended',
  })[data.status];
  $('healthSub').textContent = data.summary;

  const tp = data.topProcess;
  $('topProc').innerHTML = tp
    ? '<span class="muted">' + esc(tp.name) + ' (PID <span class="num">' + tp.pid + '</span>) — <span class="num">' + tp.cpuPct.toFixed(1) + '%</span> CPU, <span class="num">' + tp.memPct.toFixed(1) + '%</span> RAM</span>'
    : '—';

  if (data.feed) { feedItems = data.feed.slice(); renderFeed([]); }
  if (!document._gotSnapshot) {
    document._gotSnapshot = true;
    $('statusline').textContent = (isLive ? 'Live — ' : '') + 'Last updated ' + new Date(data.timestamp).toLocaleTimeString();
  }
}

function renderFeed(newOnes){
  const box = $('feed');
  if (!feedItems || feedItems.length === 0){
    box.innerHTML = '<div class="empty"><div class="ring" aria-hidden="true"></div>' +
      '<div><b>All clear</b> — no anomalies detected yet.<br/>SysSentinel keeps watching for unusual activity.</div></div>';
    return;
  }
  box.innerHTML = feedItems.map(a => {
    const isNew = newOnes.some(n => n && n.timestamp === a.timestamp && n.title === a.title);
    return '<div class="anomaly ' + (a.level === 'critical' ? 'critical' : '') + (isNew ? ' new' : '') + '">' +
      glyph(a.icon) +
      '<div><div class="t">' + esc(a.title) + '</div>' +
      '<div class="d">' + esc(a.detail) + '</div>' +
      (a.timestamp ? '<div class="time">' + esc(new Date(a.timestamp).toLocaleString()) + '</div>' : '') +
    '</div></div>';
  }).join('');
}

async function fetchStatus(manual){
  if (isLive && !manual) return;
  try{
    const r = await fetch('/api/status');
    const data = await r.json();
    render(data);
    if (manual) $('statusline').textContent = 'Refreshed at ' + new Date().toLocaleTimeString();
  }catch(e){
    $('statusline').textContent = 'Cannot reach dashboard server.';
  }
}

function showModal(title, bodyHtml, actionsHtml){
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = bodyHtml;
  $('modalActions').innerHTML = actionsHtml;
  $('modal').classList.add('show');
}
function closeModal(){ $('modal').classList.remove('show'); }

async function openHistory(){
  showModal('View History', '<p>Loading…</p>', '<button class="btn" onclick="closeModal()">Close</button>');
  try{
    const r = await fetch('/api/history?format=md');
    const txt = await r.text();
    const pre = document.createElement('pre');
    pre.textContent = txt;
    const holder = document.createElement('div');
    holder.appendChild(pre);
    const box = $('modalBody');
    box.innerHTML = '';
    box.appendChild(holder);
  }catch(e){
    $('modalBody').innerHTML = '<p>Could not load history.</p>';
  }
}

function confirmUninstall(){
  const body =
    '<p>This removes SysSentinel <b>monitoring</b> from your computer:</p>' +
    '<ul>' +
      '<li>Delete the scheduled task "<b>SysSentinelMonitor</b>"</li>' +
      '<li>Stop the running monitor process</li>' +
      '<li>Delete all saved logs and data (<code>%PROGRAMDATA%\\SysSentinel</code>)</li>' +
    '</ul>' +
    '<p>Your personal files are <b>not</b> touched. The <b>SysSentinel.exe</b> file itself is <b>not</b> deleted automatically — ' +
    'it stays where you placed it and can be removed like any program. This cannot be undone.</p>';
  const actions =
    '<button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn danger" onclick="doUninstall()">Yes, remove monitoring</button>';
  showModal('Uninstall &amp; Clean Up', body, actions);
}

async function doUninstall(){
  $('modalActions').innerHTML = '';
  $('modalBody').innerHTML = '<p><span class="spin"></span> Removing SysSentinel monitoring…</p>';
  try{
    const r = await fetch('/api/uninstall', { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    const data = await r.json();
    const steps = (data.steps || []).map(s => '<li>' + esc(s) + '</li>').join('');
    $('modalBody').innerHTML = '<p>✅ <b>SysSentinel monitoring has been removed.</b></p><ul>' + steps + '</ul>' +
      '<p>The dashboard has stopped. You can close this tab; delete the SysSentinel.exe file to finish removing it.</p>';
  }catch(e){
    $('modalBody').innerHTML = '<p>✅ <b>SysSentinel monitoring has been removed.</b></p>' +
      '<p>The dashboard server has stopped — you can close this tab, then delete the SysSentinel.exe file if you wish.</p>';
  }
}

document.addEventListener('DOMContentLoaded', setup);
</script>
</body>
</html>`;

module.exports = HTML;