'use strict';

const si = require('systeminformation');
const { TERMINAL_PROCS, THRESHOLDS, MAX_HISTORY } = require('./config');
const { timestamp } = require('./logger');

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

function collectTerminalProcesses(processList) {
  const terminals = new Map();
  for (const proc of processList) {
    if (TERMINAL_PROCS.has(String(proc.name).toLowerCase())) {
      terminals.set(proc.pid, { parentPid: proc.parentPid });
    }
  }
  return terminals;
}

function computeStatus(cpuLoad, memUsedPercent) {
  if (cpuLoad >= THRESHOLDS.criticalCpu || memUsedPercent >= THRESHOLDS.criticalMemUsedPercent) return 'critical';
  if (cpuLoad >= THRESHOLDS.warningCpu || memUsedPercent >= THRESHOLDS.warningMemUsedPercent) return 'warning';
  return 'normal';
}

async function getSnapshot(state) {
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
  const status = computeStatus(cpuLoad, usedPercent);
  const cpuJump = state.prevCpu > 0 ? cpuLoad - state.prevCpu >= THRESHOLDS.cpuSpikeJump : false;
  state.prevCpu = cpuLoad;

  const terminalPids = collectTerminalProcesses(list);
  const spawns = [];
  const firstScan = !state.terminalSeeded;

  for (const pid of terminalPids.keys()) {
    if (state.prevTerminalPids.has(pid) || firstScan) continue;
    const meta = terminalPids.get(pid);
    if (meta && meta.parentPid === process.pid) continue; // systeminformation helper
    const match = list.find((p) => p.pid === pid);
    spawns.push({
      name: match ? match.name : 'script',
      pid,
      cmdline: match && match.command ? match.command : '',
    });
  }
  state.prevTerminalPids = new Set(terminalPids.keys());
  state.terminalSeeded = true;

  const snapshot = {
    timestamp: timestamp(),
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

  snapshot.summary = plainEnglish(snapshot);

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
      title: `CPU usage spiked by ${THRESHOLDS.cpuSpikeJump}% or more`,
      detail: 'A sudden burst of processing activity was detected — a background job or script may have started.',
    });
  }

  return anomalies;
}

module.exports = { getSnapshot, buildAnomalies, plainEnglish, beautify };