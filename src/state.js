'use strict';

function createState() {
  return {
    latest: null,          // latest fast (1s) snapshot — what the UI renders
    status: 'normal',      // normal | warning | critical
    ended: false,
    heavy: null,           // last process scan: { topProcess, terminalSpawns, timestamp }
    prevCpuHeavy: 0,
    prevTerminalPids: new Set(),
    terminalSeeded: false,
    history: [],           // last MAX_HISTORY snapshots
    feed: [],              // last MAX_FEED anomalies
    lastStatus: null,
  };
}

module.exports = { createState };