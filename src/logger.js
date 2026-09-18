'use strict';

const fs = require('fs');
const path = require('path');
const { APP_NAME, LOG_ROTATE_BYTES } = require('./config');

function dataRoot() {
  const programData = process.env.ProgramData;
  if (programData) {
    try {
      fs.mkdirSync(path.join(programData, APP_NAME), { recursive: true });
      return path.join(programData, APP_NAME);
    } catch (_) { /* fall through */ }
  }
  const local = path.join(__dirname, '..', 'data');
  fs.mkdirSync(local, { recursive: true });
  return local;
}

function logsDir() {
  return path.join(dataRoot(), 'logs');
}

function ensureDirs() {
  fs.mkdirSync(logsDir(), { recursive: true });
}

const logMdPath = () => path.join(logsDir(), 'activity.md');
const logJsonlPath = () => path.join(logsDir(), 'activity.jsonl');

function timestamp() {
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
      fs.writeFileSync(file, `# archived rotated log ${timestamp()}\n`);
    }
  } catch (_) { /* no file yet */ }
}

function appendJsonl(obj) {
  try {
    const file = logJsonlPath();
    rotateIfNeeded(file);
    fs.appendFileSync(file, JSON.stringify(obj) + '\n', 'utf8');
  } catch (err) {
    console.error('jsonl write failed:', err.message);
  }
}

function appendMd(md) {
  try {
    const file = logMdPath();
    rotateIfNeeded(file);
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, `# ${APP_NAME} Activity Log\n\n`);
    }
    fs.appendFileSync(file, md + '\n', 'utf8');
  } catch (err) {
    console.error('md write failed:', err.message);
  }
}

function historyContent(format) {
  ensureDirs();
  const file = format === 'jsonl' ? logJsonlPath() : logMdPath();
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

module.exports = {
  dataRoot,
  logsDir,
  ensureDirs,
  timestamp,
  humanTime,
  appendJsonl,
  appendMd,
  historyContent,
};