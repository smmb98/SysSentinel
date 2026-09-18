'use strict';

/**
 * Server-Sent Events hub.
 * Pushes live snapshots and anomalies to dashboard clients over a single
 * long-lived HTTP connection. Zero external dependencies, minimal overhead.
 */

function createHub(heartbeatMs) {
  const clients = new Set();
  let heartbeat = null;

  function send(res, event, data) {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (_) { /* client gone */ }
  }

  function addClient(res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': connected\n\n');
    clients.add(res);
    res.on('close', () => clients.delete(res));
    res.on('error', () => clients.delete(res));
  }

  function broadcast(event, data) {
    for (const res of clients) send(res, event, data);
  }

  function start() {
    if (heartbeat || clients.size === 0) return;
    heartbeat = setInterval(() => {
      for (const res of clients) {
        try { res.write(`: hb ${Date.now()}\n\n`); } catch (_) { /* ignore */ }
      }
    }, heartbeatMs);
    heartbeat.unref && heartbeat.unref();
  }

  return {
    addClient,
    broadcast,
    send,
    start,
  };
}

module.exports = { createHub };