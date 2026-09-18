'use strict';

const { execFile } = require('child_process');
const { APP_TITLE, SCHEDULED_TASK_NAME } = require('./config');
const { deleteScheduledTask } = require('./uninstaller');

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

function uninstallScheduledTask() {
  deleteScheduledTask((err) => {
    console.log(APP_TITLE);
    console.log('==============================');
    if (err) {
      console.log('Scheduled task removal failed:', err);
      console.log('You may need Administrator rights.');
    } else {
      console.log('Removed scheduled task "SysSentinelMonitor" (or none existed).');
      console.log('SysSentinel will not start automatically anymore.');
    }
  });
}

module.exports = { installScheduledTask, uninstallScheduledTask };