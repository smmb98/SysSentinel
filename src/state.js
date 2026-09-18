'use strict';

function createState() {
  return {
    latest: null,          // latest snapshot
    status: 'normal',      // normal | warning | critical
    ended: false,
    prevCpu: 0,
    prevTerminalPids: new Set(),
    terminalSeeded: false,
    history: [],           // last MAX_HISTORY snapshots
    feed: [],              // last MAX_FEED anomalies
    lastStatus: null,
  };
}

module.exports = { createState };