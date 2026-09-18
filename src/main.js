'use strict';

const { execFile, exec } = require('child_process');
const {
  APP_TITLE,
  PORT,
  HOST,
  POLL_INTERVAL_MS,
  MAX_FEED,
  SSE_HEARTBEAT_MS,
} = require('./config');
const { createState } = require('./state');
const { ensureDirs, appendJsonl, appendMd, humanTime, timestamp, dataRoot, logsDir } = require('./logger');
const { getSnapshot, buildAnomalies } = require('./monitor');
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

async function tick(state, hub) {
  if (state.ended) return;
  try {
    const snap = await getSnapshot(state);

    appendJsonl({
      type: 'snapshot',
      ...snap,
      topProcess: snap.topProcess ? { ...snap.topProcess } : null,
      terminalSpawns: snap.terminalSpawns.map((s) => ({ ...s })),
    });

    const feedEntries = buildAnomalies(snap).map((a) => ({ ...a, timestamp: snap.timestamp }));

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
        hub.broadcast('anomaly', a);
      }
    }

    if (state.lastStatus !== snap.status) {
      const arrow = { warning: '🟠', critical: '🔴', normal: '🟢' }[snap.status] || '🟢';
      appendMd(`## ${humanTime(new Date(snap.timestamp))}\n\n${arrow} **Status changed to ${snap.status.toUpperCase()}** — ${snap.summary}\n`);
      state.lastStatus = snap.status;
    }

    hub.broadcast('snapshot', snap);
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

  console.log(APP_TITLE);
  console.log('==============================');
  console.log(`Data directory : ${dataRoot()}`);
  console.log(`Logs           : ${logsDir()}`);
  console.log(`Dashboard      : http://localhost:${PORT}`);
  console.log(`Monitoring     : every ${POLL_INTERVAL_MS / 1000} seconds`);
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

  state.timer = setInterval(() => tick(state, hub), POLL_INTERVAL_MS);
  tick(state, hub).then(() => {
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

module.exports = { main, tick };