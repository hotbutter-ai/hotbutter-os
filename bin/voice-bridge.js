#!/usr/bin/env node

const path = require('path');
const { RelayClient } = require('../lib/relay-client');
const { AgentBridge } = require('../lib/agent-bridge');
const { createServer } = require('../lib/relay/create-server');

// --- Parse args ---

const args = process.argv.slice(2);
const command = args[0];

function getFlag(name, fallback) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return fallback;
  return args[idx + 1];
}

if (command !== 'start') {
  console.log('Usage: voice-bridge start [--port <port>] [--agent-name <name>]');
  process.exit(0);
}

const port = parseInt(getFlag('--port', '3000'), 10);
const agentName = getFlag('--agent-name', 'Agent');

// --- Start embedded relay + connect as agent ---

const pwaPath = path.join(__dirname, '..', 'pwa');

async function main() {
  let serverInfo;
  try {
    serverInfo = await createServer({ port, pwaPath });
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  Error: Port ${port} is already in use.`);
      console.error(`  Try: voice-bridge start --port ${port + 1}\n`);
      process.exit(1);
    }
    throw err;
  }

  console.log(`[voice-bridge] Embedded relay started on port ${port}`);

  const relayUrl = `ws://localhost:${port}`;
  const relay = new RelayClient({ relayUrl, agentName });
  const bridge = new AgentBridge();

  relay.on('connected', () => {
    console.log('[voice-bridge] Connected to embedded relay, waiting for pairing code...');
  });

  relay.on('code', (code) => {
    const url = `http://localhost:${port}?code=${code}`;
    console.log('');
    console.log('  ┌──────────────────────────────────────────┐');
    console.log('  │                                            │');
    console.log(`  │  Pairing code:  ${code}                      │`);
    console.log('  │                                            │');
    console.log(`  │  Open in browser to start talking:         │`);
    console.log(`  │  ${url}  │`);
    console.log('  │                                            │');
    console.log('  └──────────────────────────────────────────┘');
    console.log('');
  });

  relay.on('paired', ({ sessionId }) => {
    console.log(`[voice-bridge] Client paired! Session: ${sessionId}`);
  });

  relay.on('message', async ({ sessionId, text }) => {
    console.log(`[voice-bridge] User said: "${text}"`);
    relay.sendTyping(true);

    try {
      const response = await bridge.sendMessage(sessionId, text);
      console.log(`[voice-bridge] Agent response: "${response}"`);
      relay.sendMessage(response);
      relay.sendTyping(false);
    } catch (err) {
      console.error(`[voice-bridge] Error sending to agent:`, err.message);
      relay.sendMessage('Sorry, I encountered an error processing your message.');
      relay.sendTyping(false);
    }
  });

  relay.on('client-disconnected', ({ sessionId }) => {
    console.log(`[voice-bridge] Client disconnected (session: ${sessionId})`);
  });

  relay.on('disconnected', () => {
    console.log('[voice-bridge] Disconnected from relay');
  });

  relay.on('reconnecting', ({ attempt, delay }) => {
    console.log(`[voice-bridge] Reconnecting (attempt ${attempt}, delay ${delay}ms)...`);
  });

  relay.on('error', ({ error }) => {
    console.error(`[voice-bridge] Error: ${error}`);
  });

  relay.connect();

  // Graceful shutdown
  function shutdown() {
    console.log('\n[voice-bridge] Shutting down...');
    relay.disconnect();
    serverInfo.wss.close();
    serverInfo.server.close();
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[voice-bridge] Fatal error:', err);
  process.exit(1);
});
