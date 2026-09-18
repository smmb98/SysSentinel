'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const { SCHEDULED_TASK_NAME } = require('./config');
const { dataRoot } = require('./logger');

function deleteScheduledTask(cb) {
  execFile('schtasks', ['/Delete', '/TN', SCHEDULED_TASK_NAME, '/F'], { windowsHide: true }, (err) => {
    cb(err && !/cannot find|doesn't exist|not found/i.test(err.message) ? err.message : null);
  });
}

function purgeData() {
  try {
    fs.rmSync(dataRoot(), { recursive: true, force: true });
  } catch (err) {
    console.error('purge failed:', err.message);
  }
}

function killSelf(state) {
  state.ended = true;
  try { process.exit(0); } catch (_) { /* ignore */ }
}

function uninstall(state, cb) {
  const steps = [];
  deleteScheduledTask((msg) => {
    steps.push(msg
      ? `Scheduled task cleanup: ${msg}`
      : 'Removed scheduled task SysSentinelMonitor (or none existed).');
    purgeData();
    steps.push('Purged local data directory (%PROGRAMDATA%\\SysSentinel).');
    cb(steps);
  });
}

module.exports = { deleteScheduledTask, purgeData, killSelf, uninstall };