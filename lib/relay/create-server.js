const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const { PairingManager } = require('./pairing');
const { SessionManager } = require('./sessions');
const { healthRoute } = require('./health');

/**
 * Create and start a Hotbutter Voice relay server.
 *
 * @param {object} opts
 * @param {number} [opts.port=3000]       - Port to listen on
 * @param {string} [opts.pwaPath]         - Absolute path to PWA static files
 * @param {string} [opts.landingPath]     - Absolute path to landing page static files
 * @returns {Promise<{ server: http.Server, url: string, wss: WebSocketServer }>}
 */
function createServer({ port = 3000, pwaPath, landingPath } = {}) {
  const app = express();
  const server = http.createServer(app);

  const pairing = new PairingManager();
  const sessions = new SessionManager();

  // --- HTTP routes ---

  if (landingPath) {
    // Hosted mode: landing at /, PWA at /app/
    app.get('/app', (req, res) => res.redirect(301, '/app/'));
    if (pwaPath) {
      app.use('/app', express.static(pwaPath));
    }
    app.use(express.static(landingPath));
  } else if (pwaPath) {
    // Embedded mode: PWA at /
    app.use(express.static(pwaPath));
  }

  app.get('/health', healthRoute(sessions, pairing));

  // --- WebSocket setup ---

  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const route = url.pathname;

    if (route === '/ws/agent') {
      handleAgent(ws, pairing, sessions);
    } else if (route === '/ws/client') {
      handleClient(ws, pairing, sessions);
    } else {
      ws.close(4000, 'Unknown route');
    }
  });

  // --- Heartbeat interval ---

  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30_000);

  wss.on('close', () => clearInterval(heartbeat));

  // --- Start ---

  return new Promise((resolve, reject) => {
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(err);
      } else {
        reject(err);
      }
    });

    server.listen(port, () => {
      const url = `http://localhost:${port}`;
      resolve({ server, url, wss });
    });
  });
}

// --- Agent connections ---

function handleAgent(ws, pairing, sessions) {
  let registered = false;
  let agentId = null;
  let agentName = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return send(ws, { type: 'relay:error', error: 'Invalid JSON' });
    }

    switch (msg.type) {
      case 'agent:register': {
        agentId = msg.agentId;
        agentName = msg.agentName || 'Agent';
        registered = true;
        const code = pairing.register(ws, agentId, agentName);
        send(ws, { type: 'relay:code', code });
        console.log(`[agent] registered ${agentId} → code ${code}`);
        break;
      }

      case 'agent:message': {
        if (!registered) return send(ws, { type: 'relay:error', error: 'Not registered' });
        const found = sessions.findByAgent(ws);
        if (!found) return send(ws, { type: 'relay:error', error: 'No active session' });
        send(found.session.clientWs, {
          type: 'relay:message',
          text: msg.text,
          timestamp: new Date().toISOString(),
        });
        break;
      }

      case 'agent:typing': {
        const found = sessions.findByAgent(ws);
        if (found) {
          send(found.session.clientWs, { type: 'relay:typing', active: !!msg.active });
        }
        break;
      }

      default:
        send(ws, { type: 'relay:error', error: `Unknown message type: ${msg.type}` });
    }
  });

  ws.on('close', () => {
    console.log(`[agent] disconnected ${agentId}`);
    pairing.removeByAgent(ws);
    const removed = sessions.removeByAgent(ws);
    if (removed && removed.session.clientWs.readyState === 1) {
      send(removed.session.clientWs, { type: 'relay:agent-disconnected' });
    }
  });

  ws.on('error', (err) => {
    console.error(`[agent] error ${agentId}:`, err.message);
  });

  // Heartbeat
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
}

// --- Client (PWA) connections ---

function handleClient(ws, pairing, sessions) {
  let sessionId = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return send(ws, { type: 'relay:error', error: 'Invalid JSON' });
    }

    switch (msg.type) {
      case 'client:pair': {
        const code = String(msg.code).trim();
        const entry = pairing.claim(code);
        if (!entry) {
          return send(ws, { type: 'relay:error', error: 'Invalid or expired pairing code' });
        }
        sessionId = sessions.create(entry.agentWs, ws, entry.agentId, entry.agentName);
        send(ws, { type: 'relay:paired', sessionId, agentName: entry.agentName });
        send(entry.agentWs, { type: 'relay:paired', sessionId });
        console.log(`[pair] ${code} → session ${sessionId}`);
        break;
      }

      case 'client:message': {
        if (!sessionId) return send(ws, { type: 'relay:error', error: 'Not paired' });
        const session = sessions.get(sessionId);
        if (!session) return send(ws, { type: 'relay:error', error: 'Session expired' });
        send(session.agentWs, {
          type: 'relay:message',
          sessionId,
          text: msg.text,
          timestamp: new Date().toISOString(),
        });
        break;
      }

      case 'client:disconnect': {
        if (sessionId) {
          const removed = sessions.get(sessionId);
          if (removed && removed.agentWs.readyState === 1) {
            send(removed.agentWs, { type: 'relay:client-disconnected', sessionId });
          }
          sessions.remove(sessionId);
          sessionId = null;
        }
        break;
      }

      default:
        send(ws, { type: 'relay:error', error: `Unknown message type: ${msg.type}` });
    }
  });

  ws.on('close', () => {
    console.log(`[client] disconnected (session: ${sessionId})`);
    if (sessionId) {
      const removed = sessions.get(sessionId);
      if (removed && removed.agentWs.readyState === 1) {
        send(removed.agentWs, { type: 'relay:client-disconnected', sessionId });
      }
      sessions.remove(sessionId);
    }
  });

  ws.on('error', (err) => {
    console.error(`[client] error:`, err.message);
  });

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
}

// --- Helpers ---

function send(ws, obj) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(obj));
  }
}

module.exports = { createServer };
