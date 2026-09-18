'use strict';

const http = require('http');
const { HOST } = require('../config');
const { historyContent } = require('../logger');
const dashboardHtml = require('./dashboard');
const { uninstall, killSelf } = require('../uninstaller');

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'text/html; charset=utf-8' });
  res.end(body);
}

function handleApi(req, res, state, hub) {
  const url = new URL(req.url, `http://${req.headers.host || HOST}`);

  if (url.pathname === '/api/status') {
    if (!state.latest) {
      return send(res, 503, JSON.stringify({ error: 'no data yet' }), 'application/json');
    }
    const payload = { ...state.latest, feed: state.feed.slice().reverse() };
    return send(res, 200, JSON.stringify(payload), 'application/json');
  }

  if (url.pathname === '/api/stream') {
    hub.addClient(res);
    hub.start();
    hub.send(res, 'feed', state.feed.slice().reverse());
    if (state.latest) hub.send(res, 'snapshot', state.latest);
    return;
  }

  if (url.pathname === '/api/history') {
    const format = url.searchParams.get('format') === 'jsonl' ? 'jsonl' : 'md';
    return send(res, 200, historyContent(format), format === 'jsonl' ? 'application/json' : 'text/plain; charset=utf-8');
  }

  if (url.pathname === '/api/uninstall' && req.method === 'POST') {
    uninstall(state, (steps) => {
      send(res, 200, JSON.stringify({ ok: true, steps }), 'application/json');
      setTimeout(() => killSelf(state), 1200);
    });
    return;
  }

  send(res, 404, JSON.stringify({ error: 'not found' }), 'application/json');
}

function createServer({ state, hub, onAlreadyRunning }) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || HOST}`);
    if (url.pathname.startsWith('/api/')) return handleApi(req, res, state, hub);
    send(res, 200, dashboardHtml);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      onAlreadyRunning && onAlreadyRunning();
    } else {
      console.error('Server error:', err.message);
      process.exit(1);
    }
  });

  return server;
}

module.exports = { createServer };