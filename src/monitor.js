'use strict';

const os = require('os');
const si = require('systeminformation');
const { TERMINAL_PROCS, THRESHOLDS, MAX_HISTORY } = require('./config');
const { timestamp } = require('./logger');

/* ------------------------------------------------------------------ */
/* Fast sampling (1s) — native, near-zero cost, no spawned processes   */
/* ------------------------------------------------------------------ */

let prevCpuTimes = null;

function sampleCpuLoad() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const c of cpus) {
    const t = c.times;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
    idle += t.idle;
  }
  const cur = { idle, total };
  if (prevCpuTimes === null) {
    prevCpuTimes = cur;
    return 0;
  }
  const totalDiff = cur.total - prevCpuTimes.total;
  const idleDiff = cur.idle - prevCpuTimes.idle;
  prevCpuTimes = cur;
  if (totalDiff <= 0) return 0;
  return Math.max(0, Math.min(100, 100 * (1 - idleDiff / totalDiff)));
}

function sampleMem() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return {
    totalGb: +(total / 1024 ** 3).toFixed(2),
    freeGb: +(free / 1024 ** 3).toFixed(2),
    usedGb: +(used / 1024 ** 3).toFixed(2),
    usedPercent: total > 0 ? +((used / total) * 100).toFixed(1) : 0,
  };
}

function computeStatus(cpuLoad, memUsedPercent) {
  if (cpuLoad >= THRESHOLDS.criticalCpu || memUsedPercent >= THRESHOLDS.criticalMemUsedPercent) return 'critical';
  if (cpuLoad >= THRESHOLDS.warningCpu || memUsedPercent >= THRESHOLDS.warningMemUsedPercent) return 'warning';
  return 'normal';
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

function beautify(name) {
  if (!name) return 'A program';
  return String(name)
    .replace(/\.exe$/i, '')
    .replace(/\.(cmd|bat|ps1)$/i, '')
    .trim();
}

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

function buildAnomalies(snap) {
  const anomalies = [];
  const tp = snap.topProcess;

  if (tp) {
    if (tp.cpuPct >= THRESHOLDS.highCpuProc) {
      anomalies.push({
        level: 'warning',
        icon: '⚠️',
        title: `${beautify(tp.name)} is consuming ${tp.cpuPct.toFixed(0)}% of your CPU`,
        detail: `${beautify(tp.name)} (PID ${tp.pid}) is using ${tp.cpuPct.toFixed(1)}% of one or more CPU cores — it may slow down your system.`,
      });
    }
    if (tp.memPct >= THRESHOLDS.highMemProcPercent) {
      const estGb = (snap.mem.totalGb * tp.memPct / 100).toFixed(1);
      anomalies.push({
        level: tp.memPct >= THRESHOLDS.criticalMemProcPercent ? 'critical' : 'warning',
        icon: '⚠️',
        title: `${beautify(tp.name)} is utilizing ${tp.memPct.toFixed(0)}% of your available memory`,
        detail: `${beautify(tp.name)} (PID ${tp.pid}) is using about ${estGb} GB of RAM — if it keeps growing your system may struggle.`,
      });
    }
  }

  for (const spawn of snap.terminalSpawns) {
    if (!spawn || typeof spawn !== 'object') continue;
    const name = beautify(spawn.name) || 'A background script';
    const forensic = [];
    if (spawn.scriptPath) forensic.push(`script file: ${spawn.scriptPath}`);
    if (spawn.parentName) forensic.push(`launched by ${beautify(spawn.parentName)} (PID ${spawn.parentPid || '?'})`);
    if (spawn.user) forensic.push(`user account: ${spawn.user}`);
    if (spawn.trigger) forensic.push(`likely trigger: ${spawn.trigger}`);
    const chain = forensic.length ? ` — ${forensic.join(' · ')}` : '';
    anomalies.push({
      level: 'warning',
      icon: '🖥️',
      title: 'A new background script just launched automatically',
      detail: `${name} (PID ${spawn.pid})${spawn.cmdline ? ` with command: ${spawn.cmdline}` : ''} appeared in the background.${chain} You can find and read the exact script file at the path listed above if you want to check what it does.`,
      forensics: {
        pid: spawn.pid,
        name: spawn.name,
        cmdline: spawn.cmdline || '',
        scriptPath: spawn.scriptPath || '',
        parentPid: spawn.parentPid || null,
        parentName: spawn.parentName || '',
        user: spawn.user || '',
        trigger: spawn.trigger || '',
      },
    });
  }

  if (snap.cpuSpike) {
    anomalies.push({
      level: 'warning',
      icon: '📈',
      title: `CPU usage spiked by ${THRESHOLDS.cpuSpikeJump}% or more`,
      detail: 'A sudden burst of processing activity was detected — a background job or script may have started.',
    });
  }

  return anomalies;
}

/* ------------------------------------------------------------------ */
/* Fast snapshot (CPU/RAM via os module — every 1s)                    */
/* ------------------------------------------------------------------ */

function fastSnapshot(state) {
  const load = sampleCpuLoad();
  const mem = sampleMem();
  const status = computeStatus(load, mem.usedPercent);
  const heavy = state.heavy;

  const snap = {
    timestamp: timestamp(),
    cpu: { load },
    mem,
    topProcess: heavy ? heavy.topProcess : null,
    terminalSpawns: [],
    status,
    summary: '',
  };
  snap.summary = plainEnglish(snap);

  state.latest = snap;
  state.status = status;
  state.history.push(snap);
  if (state.history.length > MAX_HISTORY) state.history.shift();

  return snap;
}

/* ------------------------------------------------------------------ */
/* Heavy scan (process table via systeminformation — every 5s)         */
/* ------------------------------------------------------------------ */

function collectTerminalProcesses(processList) {
  const terminals = new Map();
  for (const proc of processList) {
    if (TERMINAL_PROCS.has(String(proc.name).toLowerCase())) {
      terminals.set(proc.pid, {
        parentPid: proc.parentPid,
        path: proc.path || '',
        user: proc.user || '',
      });
    }
  }
  return terminals;
}

/**
 * Best-effort trigger classification — pure heuristic over the process
 * lineage already handed to us by systeminformation. No extra processes,
 * no querying schtasks. Labels: scheduled task, startup item, script
 * host, or interactive/unknown.
 */
function classifyTrigger(spawnName, parentName, parentPath) {
  const s = String(spawnName || '').toLowerCase();
  const p = String(parentName || '').toLowerCase();
  const ppath = String(parentPath || '').toLowerCase();

  if (/taskeng|taskhostw|taskhostex|svchost|schedsvc/i.test(p)) return 'scheduled task';
  if (/userinit|explorer|shell/i.test(p) || /startup|run\\|runonce/i.test(ppath)) return 'startup item';
  if (/wscript|cscript|mshta|conhost/i.test(s)) return 'script host';
  return 'interactive or unknown';
}

async function heavyScan(state) {
  const procs = await si.processes();
  const list = (procs && procs.list) || [];

  let topProcess = null;
  let maxScore = -1;
  for (const proc of list) {
    if (proc.pid === 0 || /system idle/i.test(String(proc.name))) continue;
    const cpuPct = proc.cpu || 0;
    const memPct = proc.mem || 0;
    const score = cpuPct + memPct * 4;
    if (score > maxScore) {
      maxScore = score;
      topProcess = { name: proc.name, pid: proc.pid, cpuPct, memPct };
    }
  }

  const terminalPids = collectTerminalProcesses(list);
  const spawns = [];
  const firstScan = !state.terminalSeeded;
  for (const pid of terminalPids.keys()) {
    if (state.prevTerminalPids.has(pid) || firstScan) continue;
    const meta = terminalPids.get(pid);
    if (meta && meta.parentPid === process.pid) continue; // systeminformation helper
    const match = list.find((p) => p.pid === pid);
    const parent = meta && list.find((p) => p.pid === meta.parentPid);
    const entry = {
      name: match ? match.name : 'script',
      pid,
      cmdline: match && match.command ? match.command : '',
    };
    // Forensic chain (plan.md §2) — same scan, no extra spawned processes:
    // exact script file path on disk, owning user account, and the
    // parent process (name + PID) that launched the script.
    if (match && match.path) entry.scriptPath = match.path;
    if (match && match.user) entry.user = match.user;
    if (parent) {
      entry.parentPid = meta.parentPid;
      entry.parentName = parent.name || 'unknown';
    }
    entry.trigger = classifyTrigger(entry.name, parent ? parent.name : '', parent ? parent.path : '');
    spawns.push(entry);
  }
  state.prevTerminalPids = new Set(terminalPids.keys());
  state.terminalSeeded = true;

  const cpuLoad = state.latest ? state.latest.cpu.load : 0;
  const cpuSpike = state.prevCpuHeavy > 0 && cpuLoad - state.prevCpuHeavy >= THRESHOLDS.cpuSpikeJump;
  state.prevCpuHeavy = cpuLoad;

  state.heavy = { topProcess, terminalSpawns: spawns, timestamp: timestamp() };

  return { topProcess, terminalSpawns: spawns, cpuSpike };
}

module.exports = {
  fastSnapshot,
  heavyScan,
  buildAnomalies,
  computeStatus,
  plainEnglish,
  beautify,
};