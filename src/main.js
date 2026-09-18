'use strict';

const { execFile, exec } = require('child_process');
const {
  APP_TITLE,
  PORT,
  HOST,
  POLL_INTERVAL_MS,
  FAST_POLL_INTERVAL_MS,
  MAX_FEED,
  SSE_HEARTBEAT_MS,
  LOG_RETENTION_DAYS,
  RETENTION_CHECK_MS,
} = require('./config');
const { createState } = require('./state');
const { ensureDirs, appendJsonl, appendMd, humanTime, timestamp, dataRoot, logsDir, purgeOldLogs } = require('./logger');
const { fastSnapshot, heavyScan, buildAnomalies } = require('./monitor');
const { uninstallScheduledTask, installScheduledTask } = require('./scheduler');
const { createHub } = require('./web/sse');
const { createServer } = require('./web/http-server');

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    installTask: args.includes('--install-task'),
    uninstallTask: args.includes('--uninstall-task'),
    noBrowser: args.includes('--no-browser'),
    headless: args.includes('--headless'),
  };
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

/**
 * Fast tick — every 1s. Pure os-module reads (native, no process spawns).
 * Updates the rendered snapshot, broadcasts it, and logs status transitions.
 */
function fastTick(state, hub) {
  if (state.ended) return;
  const snap = fastSnapshot(state);

  if (state.lastStatus !== snap.status) {
    const arrow = { warning: '🟠', critical: '🔴', normal: '🟢' }[snap.status] || '🟢';
    appendMd(`## ${humanTime(new Date(snap.timestamp))}\n\n${arrow} **Status changed to ${snap.status.toUpperCase()}** — ${snap.summary}\n`);
    state.lastStatus = snap.status;
  }

  hub.broadcast('snapshot', snap);
}

/**
 * Heavy tick — every 5s. The only step that spawns a helper process
 * (systeminformation process scan). Detects anomalies, logs, broadcasts.
 */
async function heavyTick(state, hub) {
  if (state.ended) return;
  try {
    const heavy = await heavyScan(state);
    const snap = state.latest;
    const ts = snap ? snap.timestamp : timestamp();

    appendJsonl({
      type: 'snapshot',
      timestamp: ts,
      cpu: snap ? snap.cpu : { load: 0 },
      mem: snap ? snap.mem : { totalGb: 0, freeGb: 0, usedGb: 0, usedPercent: 0 },
      topProcess: heavy.topProcess,
      terminalSpawns: heavy.terminalSpawns.map((s) => ({ ...s })),
      status: snap ? snap.status : 'normal',
      cpuSpike: heavy.cpuSpike,
      summary: snap ? snap.summary : '',
    });

    const feedEntries = buildAnomalies(
      snap
        ? { ...snap, topProcess: heavy.topProcess, terminalSpawns: heavy.terminalSpawns, cpuSpike: heavy.cpuSpike }
        : { cpu: { load: 0 }, mem: { totalGb: 0, freeGb: 0, usedGb: 0, usedPercent: 0 }, topProcess: heavy.topProcess, terminalSpawns: heavy.terminalSpawns, cpuSpike: heavy.cpuSpike, status: 'normal' }
    ).map((a) => ({ ...a, timestamp: ts }));

    if (feedEntries.length > 0) {
      const statusLabel = (snap && snap.status) || 'normal';
      const summary = snap ? snap.summary : '';
      let md = `## ${humanTime(new Date(ts))} — ${statusLabel.toUpperCase()}\n\n${summary}\n\n`;
      for (const a of feedEntries) {
        md += `- ${a.icon} **${a.title}** — ${a.detail}\n`;
      }
      appendMd(md);

      state.feed.push(...feedEntries);
      if (state.feed.length > MAX_FEED) state.feed.splice(0, state.feed.length - MAX_FEED);

      for (const a of feedEntries) {
        appendJsonl({ type: 'anomaly', timestamp: a.timestamp, level: a.level, title: a.title, detail: a.detail });
        hub.broadcast('anomaly', a);
      }
    }
  } catch (err) {
    appendJsonl({ type: 'error', timestamp: timestamp(), message: err.message });
  }
}

async function main() {
  const flags = parseArgs();

  if (flags.uninstallTask) {
    uninstallScheduledTask();
    return;
  }
  if (flags.installTask) {
    await installScheduledTask();
    return;
  }

  const state = createState();
  const hub = createHub(SSE_HEARTBEAT_MS);
  ensureDirs();

  const purged = purgeOldLogs(LOG_RETENTION_DAYS);
  const retentionTimer = setInterval(() => purgeOldLogs(LOG_RETENTION_DAYS), RETENTION_CHECK_MS);
  if (retentionTimer.unref) retentionTimer.unref();

  console.log(APP_TITLE);
  console.log('==============================');
  console.log(`Data directory : ${dataRoot()}`);
  console.log(`Logs           : ${logsDir()}`);
  console.log(`Dashboard      : http://localhost:${PORT}`);
  console.log(`CPU / RAM      : live every ${FAST_POLL_INTERVAL_MS / 1000}s (native)`);
  console.log(`Process scan   : every ${POLL_INTERVAL_MS / 1000}s`);
  console.log(`Log retention  : ${LOG_RETENTION_DAYS} days`);
  console.log(purged > 0 ? `Cleaned up ${purged} old log file(s).` : '');
  console.log('==============================');

  const server = createServer({
    state,
    hub,
    onAlreadyRunning: () => {
      openBrowser();
      console.log(`${APP_TITLE} is already running at http://localhost:${PORT}`);
      setTimeout(() => process.exit(0), 1500);
    },
  });

  state.timer = setInterval(() => fastTick(state, hub), FAST_POLL_INTERVAL_MS);
  state.heavyTimer = setInterval(() => heavyTick(state, hub), POLL_INTERVAL_MS);

  fastTick(state, hub);
  heavyTick(state, hub).then(() => {
    if (!flags.headless && !flags.noBrowser) openBrowser();
  });

  server.listen(PORT, HOST, () => {
    console.log('Listening on http://localhost:' + PORT);
  });

  process.on('SIGINT', () => {
    state.ended = true;
    process.exit(0);
  });
}

module.exports = { main, fastTick, heavyTick };