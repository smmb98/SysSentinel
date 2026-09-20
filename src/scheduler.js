'use strict';

/*
 * =============================================================================
 * DISABLED — the background scheduled-task feature DOES NOT WORK.
 * =============================================================================
 *
 * Why: SysSentinel ships as a Windows CONSOLE app (pkg default subsystem).
 * When the scheduled task launches it at logon with `--no-browser`, a
 * console/cmd window appears and just sits there (no dashboard, no visible
 * activity). Closing that window kills the monitor. It is not headless, so
 * "monitor at startup" is misleading.
 *
 * Integration points are commented out: api routes in http-server.js, the
 * dashboard card/buttons in dashboard.js, and the CLI flags in main.js.
 *
 * Fix before re-enabling: run the exe as a GUI subsystem (or call
 * FreeConsole(), or spawn detached with CREATE_NO_WINDOW) so no window is
 * shown, then re-wire the button and flags above.
 * =============================================================================
 */

const path = require('path');
const { execFile } = require('child_process');
const { APP_TITLE, SCHEDULED_TASK_NAME } = require('./config');
const { deleteScheduledTask } = require('./uninstaller');

/** Command the scheduled task should run (points to this executable). */
function taskCommand() {
  const exe = process.execPath;
  const base = path.basename(exe).toLowerCase();
  const isBareNode = base === 'node' || base === 'node.exe';
  const script = isBareNode ? ` ${path.join(__dirname, '..', 'server.js')}` : '';
  return `"${exe}"${script} --no-browser`;
}

/** True if the SysSentinelMonitor scheduled task currently exists. */
function taskExists() {
  return new Promise((resolve) => {
    execFile('schtasks', ['/Query', '/TN', SCHEDULED_TASK_NAME], { windowsHide: true }, (err) => {
      resolve(!err);
    });
  });
}

function createTask(runHighest) {
  const args = ['/Create', '/TN', SCHEDULED_TASK_NAME, '/TR', taskCommand(), '/SC', 'ONLOGON', '/F'];
  if (runHighest) args.push('/RL', 'HIGHEST');
  return new Promise((resolve) => {
    execFile('schtasks', args, { windowsHide: true }, (err, stdout, stderr) => {
      if (!err) return resolve({ ok: true, message: 'Scheduled task created.' });
      const msg = (stderr || err.message || '').trim();
      resolve({ ok: false, message: msg, needElevation: /access is denied|denied|elevation/i.test(msg) });
    });
  });
}

function runElevatedCreate() {
  const script =
    `Start-Process -FilePath schtasks.exe ` +
    `-ArgumentList '/Create /TN ${SCHEDULED_TASK_NAME} /TR ${taskCommand()} /SC ONLOGON /RL HIGHEST /F' ` +
    `-Verb RunAs -WindowStyle Hidden`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => {
    execFile(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true },
      (e) => (e ? reject(e) : resolve())
    );
  });
}

async function waitForTask(expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const exists = await taskExists();
    if (exists === expected) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/**
 * Install the logon task. Tries without admin first (a user can register
 * their own logon task at normal privilege); falls back to a UAC-elevated
 * schtasks (HIGHEST) if access is denied. Verifies the task actually lands
 * before reporting success.
 */
async function installTask() {
  const r = await createTask(false);
  if (r.ok) return r;
  if (!r.needElevation) return r;

  try {
    await runElevatedCreate();
  } catch (_) {
    return { ok: false, message: 'Could not start the elevated command.', elevated: false };
  }

  const landed = await waitForTask(true, 20000);
  if (landed) {
    return { ok: true, message: 'Scheduled task created (with Administrator approval).', elevated: true };
  }
  return { ok: false, message: 'Administrator approval was declined or the task could not be created.', elevated: false };
}

/** Remove the logon task. */
function uninstallTask() {
  return new Promise((resolve) => {
    deleteScheduledTask((msg) => {
      resolve(msg ? { ok: false, message: `Could not remove: ${msg}` } : { ok: true, message: 'Scheduled task removed.' });
    });
  });
}

/* ------------------------------------------------------------------ */
/* CLI wrappers (--install-task / --uninstall-task)                    */
/* ------------------------------------------------------------------ */

function cliHeader() {
  console.log(APP_TITLE);
  console.log('==============================');
  console.log('Background monitoring (Scheduled Task)');
  console.log('==============================');
}

async function cliInstallTask() {
  const r = await installTask();
  cliHeader();
  if (r.ok) {
    console.log(`Installed scheduled task "${SCHEDULED_TASK_NAME}" to run at logon.`);
    console.log('It will start monitoring in the background automatically.');
    if (r.elevated) console.log('Created with Administrator approval (UAC).');
  } else {
    console.log('Unable to install the scheduled task.');
    console.log('Without Administrator rights you can still use SysSentinel interactively.');
    console.log('Details:', r.message);
  }
  console.log('==============================');
}

async function cliUninstallTask() {
  const r = await uninstallTask();
  cliHeader();
  console.log(r.ok
    ? `Removed scheduled task "${SCHEDULED_TASK_NAME}" (or none existed).`
    : `Scheduled task removal failed: ${r.message}`);
  console.log('==============================');
}

module.exports = {}; // disabled — see banner comment above; nothing should require this
// (kept below for reference when the feature is fixed)
// module.exports = { taskExists, installTask, uninstallTask, cliInstallTask, cliUninstallTask };