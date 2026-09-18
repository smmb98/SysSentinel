'use strict';

const APP_NAME = 'SysSentinel';
const APP_TITLE = 'SysSentinel';
const SCHEDULED_TASK_NAME = 'SysSentinelMonitor';
const PORT = 4820;
const HOST = '127.0.0.1';
const POLL_INTERVAL_MS = 5000;
const FAST_POLL_INTERVAL_MS = 1000;
const LOG_ROTATE_BYTES = 10 * 1024 * 1024; // 10 MB
const LOG_RETENTION_DAYS = 30;             // delete logs older than this
const RETENTION_CHECK_MS = 12 * 60 * 60 * 1000; // re-run cleanup every 12h
const MAX_HISTORY = 100;
const MAX_FEED = 50;
const SSE_HEARTBEAT_MS = 15000;

const TERMINAL_PROCS = new Set([
  'cmd.exe',
  'powershell.exe',
  'powershell_ise.exe',
  'pwsh.exe',
  'wt.exe',
]);

const THRESHOLDS = {
  warningCpu: 80,
  criticalCpu: 95,
  warningMemUsedPercent: 80,
  criticalMemUsedPercent: 90,
  highCpuProc: 50,
  highMemProcPercent: 25,
  criticalMemProcPercent: 45,
  cpuSpikeJump: 20,
};

module.exports = {
  APP_NAME,
  APP_TITLE,
  SCHEDULED_TASK_NAME,
  PORT,
  HOST,
  POLL_INTERVAL_MS,
  FAST_POLL_INTERVAL_MS,
  LOG_ROTATE_BYTES,
  LOG_RETENTION_DAYS,
  RETENTION_CHECK_MS,
  MAX_HISTORY,
  MAX_FEED,
  SSE_HEARTBEAT_MS,
  TERMINAL_PROCS,
  THRESHOLDS,
};