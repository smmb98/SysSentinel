'use strict';

const { APP_NAME, PORT } = require('../config');

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${APP_NAME} — System Health</title>
<style>
  :root{
    --bg:#0b0f14; --panel:#131a22; --panel2:#0f151c; --border:#1f2a35;
    --text:#e6edf3; --muted:#8b98a5; --green:#22c55e; --orange:#f59e0b;
    --red:#ef4444; --blue:#3b82f6;
  }
  *{box-sizing:border-box; margin:0; padding:0;}
  body{
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    background:var(--bg); color:var(--text); min-height:100vh;
    padding:24px; max-width:1080px; margin:0 auto;
  }
  header{display:flex; align-items:center; gap:14px; margin-bottom:24px;}
  .logo{width:42px;height:42px;border-radius:10px;background:linear-gradient(135deg,#3b82f6,#22c55e);
    display:flex;align-items:center;justify-content:center;font-size:22px;}
  h1{font-size:22px;font-weight:600;}
  .sub{color:var(--muted); font-size:13px; margin-top:2px;}
  .livebadge{display:inline-block; margin-left:8px; font-size:11px; color:#0b0f14; background:var(--green);
    border-radius:20px; padding:2px 9px; font-weight:600; letter-spacing:.03em;}
  .livebadge.reconnecting{background:var(--orange);}
  .grid{display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:18px;}
  .card{background:var(--panel); border:1px solid var(--border); border-radius:14px; padding:20px;}
  .card h3{font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin-bottom:14px;}
  .health{display:flex; align-items:center; gap:16px;}
  .dot{width:20px;height:20px;border-radius:50%; flex:0 0 auto; box-shadow:0 0 18px currentColor;}
  .dot.normal{background:var(--green); color:var(--green);}
  .dot.warning{background:var(--orange); color:var(--orange);}
  .dot.critical{background:var(--red); color:var(--red);}
  .health-title{font-size:19px; font-weight:600;}
  .health-sub{color:var(--muted); font-size:13px; margin-top:4px;}
  .metrics{display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:18px;}
  .metric .value{font-size:24px; font-weight:700;}
  .metric .label{color:var(--muted); font-size:12px; margin-top:3px;}
  .bar{height:8px; background:var(--panel2); border-radius:6px; overflow:hidden; margin-top:8px;}
  .bar>span{display:block; height:100%; border-radius:6px; transition:width .5s ease;}
  .proc-info{margin-top:16px; border-top:1px solid var(--border); padding-top:14px; font-size:14px;}
  .proc-info b{font-weight:600;}
  .proc-info .muted{color:var(--muted);}
  .feed{display:flex; flex-direction:column; gap:12px;}
  .anomaly{display:flex; gap:12px; padding:14px; background:var(--panel2); border:1px solid var(--border);
    border-radius:12px; border-left:3px solid var(--orange); animation:slide .35s ease;}
  .anomaly.critical{border-left-color:var(--red);}
  .anomaly.new{outline:1px solid rgba(245,158,11,.45);}
  @keyframes slide{from{opacity:0; transform:translateY(-6px);} to{opacity:1; transform:none;}}
  .anomaly .icon{font-size:18px;}
  .anomaly .t{font-weight:600; font-size:14px;}
  .anomaly .d{color:var(--muted); font-size:13px; margin-top:4px;}
  .anomaly .time{color:var(--muted); font-size:11px; margin-top:6px;}
  .empty{color:var(--muted); font-size:14px; padding:14px 0;}
  .actions{display:flex; flex-wrap:wrap; gap:12px; margin-top:22px;}
  button{
    cursor:pointer; border:1px solid var(--border); background:var(--panel); color:var(--text);
    padding:11px 18px; border-radius:10px; font-size:14px; font-weight:500; transition:.15s;
  }
  button:hover{background:#1a2330; border-color:#2c3a49;}
  button.primary{background:var(--blue); border-color:var(--blue); color:#fff;}
  button.primary:hover{background:#2f6fe0; border-color:#2f6fe0;}
  button.danger{background:transparent; border-color:#7f1d1d; color:#f87171;}
  button.danger:hover{background:#1c0f12; border-color:#b91c1c;}
  footer{color:var(--muted); font-size:12px; margin-top:28px; opacity:.8;}
  .modal{display:none; position:fixed; inset:0; background:rgba(0,0,0,.6); align-items:center; justify-content:center; z-index:50; padding:20px;}
  .modal.show{display:flex;}
  .modal-card{background:var(--panel); border:1px solid var(--border); border-radius:14px; max-width:520px; width:100%; padding:24px;}
  .modal-card h2{font-size:18px; margin-bottom:12px;}
  .modal-card p{color:var(--muted); font-size:14px; line-height:1.6;}
  .modal-card ul{margin:12px 0 6px 18px; color:var(--muted); font-size:14px; line-height:1.8;}
  .modal-card .row{display:flex; gap:12px; justify-content:flex-end; margin-top:20px;}
  .spin{display:inline-block; width:14px; height:14px; border:2px solid rgba(255,255,255,.3);
    border-top-color:#fff; border-radius:50%; animation:spin 0.8s linear infinite; vertical-align:-2px;}
  @keyframes spin{to{transform:rotate(360deg);}}
</style>
</head>
<body>
  <header>
    <div class="logo">🛡️</div>
    <div>
      <h1>${APP_NAME}<span class="livebadge" id="liveBadge" style="display:none">LIVE</span></h1>
      <div class="sub" id="statusline">Connecting…</div>
    </div>
  </header>

  <div class="grid">
    <div class="card">
      <h3>System Health</h3>
      <div class="health">
        <div class="dot normal" id="dot"></div>
        <div>
          <div class="health-title" id="healthTitle">Checking…</div>
          <div class="health-sub" id="healthSub">Waiting for first sample</div>
        </div>
      </div>
      <div class="metrics">
        <div class="metric">
          <div class="value" id="cpuVal">—</div>
          <div class="label">CPU Load</div>
          <div class="bar"><span id="cpuBar" style="width:0%; background:var(--green)"></span></div>
        </div>
        <div class="metric">
          <div class="value" id="ramVal">—</div>
          <div class="label">RAM Free</div>
          <div class="bar"><span id="ramBar" style="width:0%; background:var(--green)"></span></div>
        </div>
      </div>
      <div class="proc-info">
        <b>Top process:</b> <span id="topProc">Scanning…</span>
      </div>
    </div>

    <div class="card">
      <h3>Active Anomaly Feed</h3>
      <div class="feed" id="feed"><div class="empty">No anomalies detected yet.<br/>SysSentinel is watching for unusual activity.</div></div>
    </div>
  </div>

  <div class="actions">
    <button class="primary" id="refreshBtn">🔄 Refresh Status</button>
    <button id="historyBtn">📜 View History</button>
    <button class="danger" id="uninstallBtn">🗑️ Uninstall Safely</button>
  </div>

  <footer>${APP_NAME} — local only. Listens on http://localhost:${PORT} on this machine. No data leaves your PC.<br/>
  <span class="livebadge" id="footLive" style="display:none">LIVE</span></footer>

  <div class="modal" id="modal">
    <div class="modal-card">
      <h2 id="modalTitle"></h2>
      <div id="modalBody"></div>
      <div class="row" id="modalActions"></div>
    </div>
  </div>

<script>
const $ = (id) => document.getElementById(id);
let feedItems = [];
let isLive = false;
let es = null;

function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setup(){
  $('refreshBtn').onclick = () => fetchStatus(true);
  $('historyBtn').onclick = openHistory;
  $('uninstallBtn').onclick = confirmUninstall;
  connectStream();
  setInterval(() => { if (!isLive) fetchStatus(false); }, 5000);
}

function setLive(on, reconnecting){
  isLive = on;
  const b = $('liveBadge'), f = $('footLive');
  b.style.display = on ? '' : 'none';
  f.style.display = on ? '' : 'none';
  b.className = 'livebadge' + (reconnecting ? ' reconnecting' : '');
  f.className = 'livebadge' + (reconnecting ? ' reconnecting' : '');
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
  $('topProc').textContent = tp
    ? tp.name + ' (PID ' + tp.pid + ') — ' + tp.cpuPct.toFixed(1) + '% CPU, ' + tp.memPct.toFixed(1) + '% RAM'
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
    box.innerHTML = '<div class="empty">No anomalies detected yet.<br/>SysSentinel is watching for unusual activity.</div>';
    return;
  }
  box.innerHTML = feedItems.map(a => {
    const isNew = newOnes.some(n => n && n.timestamp === a.timestamp && n.title === a.title);
    return '<div class="anomaly ' + (a.level === 'critical' ? 'critical' : '') + (isNew ? ' new' : '') + '">' +
      '<div class="icon">' + esc(a.icon || '⚠️') + '</div>' +
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
  showModal('View History', '<p>Loading…</p>', '<button onclick="closeModal()">Close</button>');
  try{
    const r = await fetch('/api/history?format=md');
    const txt = await r.text();
    const pre = document.createElement('pre');
    pre.style.cssText = 'white-space:pre-wrap;background:#0d1218;border:1px solid var(--border);border-radius:8px;padding:14px;font-size:12px;max-height:50vh;overflow:auto;color:#b9c7d2;';
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
    '<p>This will completely remove ${APP_NAME} from your computer, leaving <b>zero residual footprint</b>:</p>' +
    '<ul>' +
      '<li>Delete the scheduled task "<b>SysSentinelMonitor</b>"</li>' +
      '<li>Stop the running monitor process</li>' +
      '<li>Delete the local data directory (<code>%PROGRAMDATA%\\SysSentinel</code>) with all logs</li>' +
    '</ul>' +
    '<p>Your personal files and settings are <b>not</b> touched. This cannot be undone.</p>';
  const actions =
    '<button onclick="closeModal()">Cancel</button>' +
    '<button class="danger" onclick="doUninstall()">Yes, uninstall</button>';
  showModal('Uninstall & Clean Up', body, actions);
}

async function doUninstall(){
  $('modalActions').innerHTML = '';
  $('modalBody').innerHTML = '<p><span class="spin"></span> Removing ${APP_NAME}…</p>';
  try{
    const r = await fetch('/api/uninstall', { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    const data = await r.json();
    const steps = (data.steps || []).map(s => '<li>' + s + '</li>').join('');
    $('modalBody').innerHTML = '<p>✅ <b>${APP_NAME} has been removed.</b></p><ul>' + steps + '</ul><p>You can close this tab now.</p>';
  }catch(e){
    $('modalBody').innerHTML = '<p>✅ <b>${APP_NAME} has been removed.</b></p><p>The dashboard server has stopped — you can close this tab.</p>';
  }
}

document.addEventListener('DOMContentLoaded', setup);
</script>
</body>
</html>`;

module.exports = HTML;