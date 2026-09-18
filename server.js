'use strict';

/**
 * SysSentinel
 * Zero-trust system diagnostic & telemetry daemon with a local web dashboard.
 * Single self-contained file. Compiles to a standalone Windows .exe via `pkg`.
 */

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, exec } = require('child_process');
const si = require('systeminformation');

const APP_NAME = 'SysSentinel';
const APP_TITLE = 'SysSentinel';
const SCHEDULED_TASK_NAME = 'SysSentinelMonitor';
const PORT = 4820;
const HOST = '127.0.0.1';
const POLL_INTERVAL_MS = 5000;
const LOG_ROTATE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_HISTORY = 100;
const MAX_FEED = 50;

const TERMINAL_PROCS = new Set([
  'cmd.exe',
  'powershell.exe',
  'powershell_ise.exe',
  'pwsh.exe',
  'wt.exe',
]);

/* ------------------------------------------------------------------ */
/* Paths & data directory                                              */
/* ------------------------------------------------------------------ */

function dataRoot() {
  const programData = process.env.ProgramData;
  if (programData) {
    try {
      fs.mkdirSync(path.join(programData, APP_NAME), { recursive: true });
      return path.join(programData, APP_NAME);
    } catch (_) { /* fall through */ }
  }
  const local = path.join(__dirname, 'data');
  fs.mkdirSync(local, { recursive: true });
  return local;
}

function logsDir() {
  return path.join(dataRoot(), 'logs');
}

function ensureDirs() {
  fs.mkdirSync(logsDir(), { recursive: true });
}

/* ------------------------------------------------------------------ */
/* Logging (dual stream)                                               */
/* ------------------------------------------------------------------ */

const LOG_MD = () => path.join(logsDir(), 'activity.md');
const LOG_JSONL = () => path.join(logsDir(), 'activity.jsonl');

function stamp() {
  return new Date().toISOString();
}

function humanTime(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

function rotateIfNeeded(file) {
  try {
    const st = fs.statSync(file);
    if (st.size > LOG_ROTATE_BYTES) {
      fs.renameSync(file, `${file}.${Date.now()}.bak`);
      fs.writeFileSync(file, `# archived rotated log ${stamp()}\n`);
    }
  } catch (_) { /* no file yet */ }
}

function appendJsonl(obj) {
  try {
    const file = LOG_JSONL();
    rotateIfNeeded(file);
    fs.appendFileSync(file, JSON.stringify(obj) + '\n', 'utf8');
  } catch (err) {
    console.error('jsonl write failed:', err.message);
  }
}

function appendMd(md) {
  try {
    const file = LOG_MD();
    rotateIfNeeded(file);
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, `# ${APP_NAME} Activity Log\n\n`);
    }
    fs.appendFileSync(file, md + '\n', 'utf8');
  } catch (err) {
    console.error('md write failed:', err.message);
  }
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const state = {
  latest: null,          // latest snapshot
  status: 'normal',      // normal | warning | critical
  ended: false,
  prevCpu: 0,
  prevTerminalPids: new Set(),
  terminalSeeded: false,
  history: [],           // last MAX_HISTORY snapshots
  feed: [],              // last MAX_FEED anomalies
};

function plainEnglish(snap) {
  const freeGb = snap.mem.freeGb.toFixed(1);
  const totalGb = snap.mem.totalGb.toFixed(1);
  const cpu = snap.cpu.load.toFixed(0);
  const usedPct = snap.mem.usedPercent;
  const p = snap.topProcess;
  let line = `System is healthy — CPU at ${cpu}%, ${freeGb} GB of ${totalGb} GB RAM free`;
  if (snap.status === 'warning') {
    line = `System under strain — CPU at ${cpu}%; only ${freeGb} GB of ${totalGb} GB RAM free (${usedPct}% used)`;
  } else if (snap.status === 'critical') {
    line = `Critical — CPU at ${cpu}% and memory nearly exhausted (${usedPct}% used, ${freeGb} GB free)`;
  }
  if (p) {
    line += `. Top consumer: ${p.name} (PID ${p.pid}) at ${p.cpuPct.toFixed(1)}% CPU / ${p.memPct.toFixed(1)}% memory`;
  }
  return line;
}

/* ------------------------------------------------------------------ */
/* Monitoring engine                                                   */
/* ------------------------------------------------------------------ */

async function collectTerminalProcesses(processList) {
  const terminals = new Map(); // pid -> { parentPid }
  for (const proc of processList) {
    if (TERMINAL_PROCS.has(String(proc.name).toLowerCase())) {
      terminals.set(proc.pid, { parentPid: proc.parentPid });
    }
  }
  return terminals;
}

async function getSnapshot() {
  const [load, mem, procs] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.processes(),
  ]);

  const totalGb = mem.total / 1024 / 1024 / 1024;
  const freeGb = mem.available / 1024 / 1024 / 1024;
  const usedGb = totalGb - freeGb;
  const usedPercent = totalGb > 0 ? (usedGb / totalGb) * 100 : 0;

  let topProcess = null;
  let maxScore = -1;
  const list = (procs && procs.list) || [];
  for (const proc of list) {
    if (proc.pid === 0 || /system idle/i.test(String(proc.name))) continue;
    const cpuPct = proc.cpu || 0;
    const memPct = proc.mem || 0;
    const score = cpuPct + memPct * 4;
    if (score > maxScore) {
      maxScore = score;
      topProcess = {
        name: proc.name,
        pid: proc.pid,
        cpuPct,
        memPct,
      };
    }
  }

  const cpuLoad = load.currentLoad || 0;

  let status = 'normal';
  if (cpuLoad >= 95 || usedPercent >= 90) status = 'critical';
  else if (cpuLoad >= 80 || usedPercent >= 80) status = 'warning';

  const cpuJump = state.prevCpu > 0 ? cpuLoad - state.prevCpu >= 20 : false;
  state.prevCpu = cpuLoad;

  const terminalPids = await collectTerminalProcesses(list);
  const spawns = [];
  let firstScan = state.prevTerminalPids.size === 0 && !state.terminalSeeded;
  for (const pid of terminalPids.keys()) {
    if (!state.prevTerminalPids.has(pid) && !firstScan) {
      const meta = terminalPids.get(pid);
      if (meta && meta.parentPid === process.pid) continue; // systeminformation helper
      const match = list.find((p) => p.pid === pid);
      spawns.push({
        name: match ? match.name : 'script',
        pid,
        cmdline: match && match.command ? match.command : '',
      });
    }
  }
  state.prevTerminalPids = new Set(terminalPids.keys());
  state.terminalSeeded = true;

  const snapshot = {
    timestamp: stamp(),
    cpu: { load: cpuLoad },
    mem: {
      totalGb: +totalGb.toFixed(2),
      freeGb: +freeGb.toFixed(2),
      usedGb: +usedGb.toFixed(2),
      usedPercent: +usedPercent.toFixed(1),
    },
    topProcess,
    status,
    terminalSpawns: spawns,
    cpuSpike: cpuJump,
    summary: '',
  };

  state.latest = snapshot;
  state.status = status;
  state.history.push(snapshot);
  if (state.history.length > MAX_HISTORY) state.history.shift();

  return snapshot;
}

function buildAnomalies(snap) {
  const anomalies = [];
  const tp = snap.topProcess;

  if (tp) {
    if (tp.cpuPct >= 50) {
      anomalies.push({
        level: 'warning',
        icon: '⚠️',
        title: `${beautify(tp.name)} is consuming ${tp.cpuPct.toFixed(0)}% of your CPU`,
        detail: `${beautify(tp.name)} (PID ${tp.pid}) is using ${tp.cpuPct.toFixed(1)}% of one or more CPU cores — it may slow down your system.`,
      });
    }
    if (tp.memPct >= 25) {
      const estGb = (snap.mem.totalGb * tp.memPct / 100).toFixed(1);
      anomalies.push({
        level: tp.memPct >= 45 ? 'critical' : 'warning',
        icon: '⚠️',
        title: `${beautify(tp.name)} is utilizing ${tp.memPct.toFixed(0)}% of your available memory`,
        detail: `${beautify(tp.name)} (PID ${tp.pid}) is using about ${estGb} GB of RAM — if it keeps growing your system may struggle.`,
      });
    }
  }

  for (const spawn of snap.terminalSpawns) {
    anomalies.push({
      level: 'warning',
      icon: '🖥️',
      title: 'A new background script just launched automatically',
      detail: `${beautify(spawn.name)} (PID ${spawn.pid}) ${spawn.cmdline ? `with command: ${spawn.cmdline}` : 'appeared in the background'}. This may be a scheduled task, startup item, or unexpected popup.`,
    });
  }

  if (snap.cpuSpike) {
    anomalies.push({
      level: 'warning',
      icon: '📈',
      title: `CPU usage spiked by 20% or more in the last ${POLL_INTERVAL_MS / 1000}s`,
      detail: 'A sudden burst of processing activity was detected — a background job or script may have started.',
    });
  }

  return anomalies;
}

function beautify(name) {
  if (!name) return 'A program';
  return String(name).replace(/\.exe$/i, '').replace(/\.(cmd|bat|ps1)$/i, '').trim();
}

async function tick() {
  if (state.ended) return;
  try {
    const snap = await getSnapshot();
    snap.summary = plainEnglish(snap);

    appendJsonl({
      type: 'snapshot',
      ...snap,
      topProcess: snap.topProcess ? JSON.parse(JSON.stringify(snap.topProcess)) : null,
      terminalSpawns: snap.terminalSpawns.map((s) => JSON.parse(JSON.stringify(s))),
    });

    const anomalies = buildAnomalies(snap);
    const feedEntries = anomalies.map((a) => ({ ...a, timestamp: snap.timestamp }));

    if (feedEntries.length > 0) {
      let md = `## ${humanTime(new Date(snap.timestamp))} — ${snap.status.toUpperCase()}\n\n${snap.summary}\n\n`;
      for (const a of feedEntries) {
        md += `- ${a.icon} **${a.title}** — ${a.detail}\n`;
      }
      appendMd(md);
      state.feed.push(...feedEntries);
      if (state.feed.length > MAX_FEED) state.feed.splice(0, state.feed.length - MAX_FEED);

      for (const a of feedEntries) {
        appendJsonl({ type: 'anomaly', timestamp: a.timestamp, level: a.level, title: a.title, detail: a.detail });
      }
    }

    if (state.lastStatus !== snap.status) {
      const arrow = { warning: '🟠', critical: '🔴', normal: '🟢' }[snap.status] || '🟢';
      appendMd(`## ${humanTime(new Date(snap.timestamp))}\n\n${arrow} **Status changed to ${snap.status.toUpperCase()}** — ${snap.summary}\n`);
      state.lastStatus = snap.status;
    }
  } catch (err) {
    appendJsonl({ type: 'error', timestamp: stamp(), message: err.message });
  }
}

/* ------------------------------------------------------------------ */
/* Uninstaller (zero trust)                                            */
/* ------------------------------------------------------------------ */

function deleteScheduledTask(cb) {
  execFile('schtasks', ['/Delete', '/TN', SCHEDULED_TASK_NAME, '/F'], { windowsHide: true }, (err) => {
    // Exit code 0 = deleted. Also treat "not found" as success.
    cb(!!err ? err.message : null);
  });
}

function purgeData() {
  try {
    const root = dataRoot();
    fs.rmSync(root, { recursive: true, force: true });
  } catch (err) {
    console.error('purge failed:', err.message);
  }
}

function killSelf() {
  state.ended = true;
  try { process.exit(0); } catch (_) { /* ignore */ }
}

function uninstall(cb) {
  const steps = [];
  deleteScheduledTask((msg) => {
    if (msg && !/cannot find|doesn't exist|not found/i.test(msg)) {
      steps.push(`Scheduled task cleanup: ${msg}`);
    } else {
      steps.push('Removed scheduled task SysSentinelMonitor (or none existed).');
    }
    purgeData();
    steps.push('Purged local data directory (%PROGRAMDATA%\\SysSentinel).');
    cb(steps);
  });
}

/* ------------------------------------------------------------------ */
/* Scheduled task hooks (CLI flags)                                    */
/* ------------------------------------------------------------------ */

async function installScheduledTask() {
  const exe = process.execPath;
  const tr = `"${exe}" --no-browser`;
  const run = () =>
    new Promise((resolve) => {
      execFile(
        'schtasks',
        ['/Create', '/TN', SCHEDULED_TASK_NAME, '/TR', tr, '/SC', 'ONLOGON', '/RL', 'HIGHEST', '/F'],
        { windowsHide: true },
        (err, stdout, stderr) => resolve(err ? (stderr || err.message) : null)
      );
    });
  const err = await run();
  console.log(APP_TITLE);
  console.log('==============================');
  console.log('Background monitoring (Scheduled Task)');
  console.log('==============================');
  if (err) {
    console.log('Unable to install the scheduled task. It usually requires Administrator rights.');
    console.log('You can still use SysSentinel in interactive mode.');
    console.log('Details:', err);
  } else {
    console.log(`Installed scheduled task "${SCHEDULED_TASK_NAME}" to run at logon.`);
    console.log('It will start monitoring in the background automatically.');
  }
  console.log('==============================');
  console.log('Tip: if a "System Health" tab opens, close it now.');
  console.log('SysSentinel continues running for this session.');
}

async function uninstallScheduledTask() {
  deleteScheduledTask((err) => {
    console.log(APP_TITLE);
    console.log('==============================');
    if (err && !/cannot find|doesn't exist|not found/i.test(err)) {
      console.log('Scheduled task removal failed:', err);
      console.log('You may need Administrator rights.');
    } else {
      console.log('Removed scheduled task "SysSentinelMonitor" (or none existed).');
      console.log('SysSentinel will not start automatically anymore.');
    }
  });
}

/* ------------------------------------------------------------------ */
/* History                                                            */
/* ------------------------------------------------------------------ */

function historyContent(format) {
  ensureDirs();
  const file = format === 'jsonl' ? LOG_JSONL() : LOG_MD();
  try {
    if (!fs.existsSync(file)) {
      return format === 'jsonl' ? '[]' : '# SysSentinel Activity Log\n\nNo activity recorded yet.\n';
    }
    if (format === 'jsonl') {
      const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
      return `[${lines.join(',')}]`;
    }
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    return `Error reading history: ${err.message}`;
  }
}

/* ------------------------------------------------------------------ */
/* Dashboard UI (embedded, offline-first CSS)                          */
/* ------------------------------------------------------------------ */

const DASHBOARD_HTML = `<!DOCTYPE html>
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
  .bar>span{display:block; height:100%; border-radius:6px; transition:width .6s ease;}
  .proc-info{margin-top:16px; border-top:1px solid var(--border); padding-top:14px; font-size:14px;}
  .proc-info b{font-weight:600;}
  .proc-info .muted{color:var(--muted);}
  .feed{display:flex; flex-direction:column; gap:12px;}
  .anomaly{display:flex; gap:12px; padding:14px; background:var(--panel2); border:1px solid var(--border);
    border-radius:12px; border-left:3px solid var(--orange);}
  .anomaly.critical{border-left-color:var(--red);}
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
      <h1>${APP_NAME}</h1>
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

  <footer>${APP_NAME} — local only. Listens on http://localhost:${PORT} on this machine. No data leaves your PC.</footer>

  <div class="modal" id="modal">
    <div class="modal-card">
      <h2 id="modalTitle"></h2>
      <div id="modalBody"></div>
      <div class="row" id="modalActions"></div>
    </div>
  </div>

<script>
const $ = (id) => document.getElementById(id);
const emoji = '🛡️';

function setup(){
  $('refreshBtn').onclick = () => fetchStatus();
  $('historyBtn').onclick = openHistory;
  $('uninstallBtn').onclick = confirmUninstall;
  fetchStatus();
  setInterval(fetchStatus, 5000);
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
  $('statusline').textContent = 'Last updated ' + new Date(data.timestamp).toLocaleTimeString();

  const tp = data.topProcess;
  $('topProc').textContent = tp
    ? tp.name + ' (PID ' + tp.pid + ') — ' + tp.cpuPct.toFixed(1) + '% CPU, ' + tp.memPct.toFixed(1) + '% RAM'
    : '—';

  renderFeed(data.anomalies || data.feed || []);
}

function renderFeed(anomalies){
  const box = $('feed');
  if (!anomalies || anomalies.length === 0){
    box.innerHTML = '<div class="empty">No anomalies detected yet.<br/>SysSentinel is watching for unusual activity.</div>';
    return;
  }
  box.innerHTML = anomalies.map(a =>
    '<div class="anomaly ' + (a.level === 'critical' ? 'critical' : '') + '">' +
      '<div class="icon">' + (a.icon || '⚠️') + '</div>' +
      '<div><div class="t">' + a.title + '</div>' +
      '<div class="d">' + a.detail + '</div>' +
      (a.timestamp ? '<div class="time">' + new Date(a.timestamp).toLocaleString() + '</div>' : '') +
    '</div></div>'
  ).join('');
}

async function fetchStatus(){
  try{
    const r = await fetch('/api/status');
    const data = await r.json();
    render(data);
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
  let body = '<p>Loading…</p>';
  showModal('View History', body, '<button onclick="closeModal()">Close</button>');
  try{
    const r = await fetch('/api/history?format=md');
    const txt = await r.text();
    const pre = document.createElement('pre');
    pre.style.cssText = 'white-space:pre-wrap;background:#0d1218;border:1px solid var(--border);border-radius:8px;padding:14px;font-size:12px;max-height:50vh;overflow:auto;color:#b9c7d2;';
    pre.textContent = txt;
    const holder = document.createElement('div');
    holder.appendChild(pre);
    const box = $('modalBody');
    box.textContent = '';
    box.appendChild(holder);
  }catch(e){
    $('modalBody').textContent = 'Could not load history.';
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
  const body = '<p><span class="spin"></span> Removing ${APP_NAME}…</p>';
  $('modalActions').innerHTML = '';
  $('modalBody').innerHTML = body;
  try{
    const r = await fetch('/api/uninstall', { method: 'POST' });
    const data = await r.json();
    $('modalBody').innerHTML = '<p>✅ <b>${APP_NAME} has been removed.</b></p><ul>' +
      (data.steps || []).map(s => '<li>' + s + '</li>').join('') +
      '</ul><p>You can close this tab now.</p>';
  }catch(e){
    $('modalBody').innerHTML = '<p>✅ <b>${APP_NAME} has been removed.</b></p><p>The dashboard server has stopped — you can close this tab.</p>';
  }
}

document.addEventListener('DOMContentLoaded', setup);
</script>
</body>
</html>`;

/* ------------------------------------------------------------------ */
/* HTTP server                                                         */
/* ------------------------------------------------------------------ */

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'text/html; charset=utf-8' });
  res.end(body);
}

function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || HOST}`);

  if (url.pathname === '/api/status') {
    if (!state.latest) {
      return send(res, 503, JSON.stringify({ error: 'no data yet' }), 'application/json');
    }
    const payload = { ...state.latest, anomalies: state.feed.slice().reverse() };
    return send(res, 200, JSON.stringify(payload), 'application/json');
  }

  if (url.pathname === '/api/history') {
    const format = url.searchParams.get('format') === 'jsonl' ? 'jsonl' : 'md';
    return send(res, 200, historyContent(format), format === 'jsonl' ? 'application/json' : 'text/plain; charset=utf-8');
  }

  if (url.pathname === '/api/uninstall' && req.method === 'POST') {
    uninstall((steps) => {
      send(res, 200, JSON.stringify({ ok: true, steps }), 'application/json');
      setTimeout(killSelf, 1200);
    });
    return;
  }

  send(res, 404, JSON.stringify({ error: 'not found' }), 'application/json');
}

function createServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || HOST}`);
    if (url.pathname.startsWith('/api/')) return handleApi(req, res);
    send(res, 200, DASHBOARD_HTML);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      // Another instance is already serving — just open the browser to it.
      openBrowser();
      console.log(`${APP_TITLE} is already running at http://localhost:${PORT}`);
      setTimeout(() => process.exit(0), 1500);
    } else {
      console.error('Server error:', err.message);
      process.exit(1);
    }
  });

  return server;
}

function openBrowser() {
  const url = `http://localhost:${PORT}`;
  if (process.platform === 'win32') {
    exec(`start "" "${url}"`, { windowsHide: true }, () => {});
  } else if (process.platform === 'darwin') {
    execFile('open', [url], () => {});
  } else {
    execFile('xdg-open', [url], () => {});
  }
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    installTask: args.includes('--install-task'),
    uninstallTask: args.includes('--uninstall-task'),
    noBrowser: args.includes('--no-browser'),
    headless: args.includes('--headless'),
  };
}

async function main() {
  const flags = parseArgs();

  if (flags.uninstallTask) {
    await uninstallScheduledTask();
    return;
  }
  if (flags.installTask) {
    await installScheduledTask();
    return;
  }

  ensureDirs();
  console.log(APP_TITLE);
  console.log('==============================');
  console.log(`Data directory : ${dataRoot()}`);
  console.log(`Logs           : ${logsDir()}`);
  console.log(`Dashboard      : http://localhost:${PORT}`);
  console.log(`Monitoring     : every ${POLL_INTERVAL_MS / 1000} seconds`);
  console.log('==============================');

  state.timer = setInterval(tick, POLL_INTERVAL_MS);
  tick().then(() => {
    if (!flags.headless && !flags.noBrowser) openBrowser();
  });

  const server = createServer();
  server.listen(PORT, HOST, () => {
    console.log('Listening on http://localhost:' + PORT);
  });
}

process.on('SIGINT', () => {
  state.ended = true;
  process.exit(0);
});

main();