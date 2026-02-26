const crypto = require('crypto');

const CODE_LENGTH = 6;
const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

class PairingManager {
  constructor() {
    // code → { agentWs, agentId, agentName, createdAt }
    this.pending = new Map();
    // Clean up expired codes every 60s
    this._cleanupInterval = setInterval(() => this.cleanup(), 60_000);
  }

  generateCode() {
    const max = Math.pow(10, CODE_LENGTH);
    let code;
    do {
      code = String(crypto.randomInt(0, max)).padStart(CODE_LENGTH, '0');
    } while (this.pending.has(code));
    return code;
  }

  register(agentWs, agentId, agentName) {
    const code = this.generateCode();
    this.pending.set(code, {
      agentWs,
      agentId,
      agentName: agentName || 'Agent',
      createdAt: Date.now(),
    });
    return code;
  }

  claim(code) {
    const entry = this.pending.get(code);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > CODE_TTL_MS) {
      this.pending.delete(code);
      return null;
    }
    this.pending.delete(code);
    return entry;
  }

  removeByAgent(agentWs) {
    for (const [code, entry] of this.pending) {
      if (entry.agentWs === agentWs) {
        this.pending.delete(code);
      }
    }
  }

  cleanup() {
    const now = Date.now();
    for (const [code, entry] of this.pending) {
      if (now - entry.createdAt > CODE_TTL_MS) {
        this.pending.delete(code);
      }
    }
  }

  destroy() {
    clearInterval(this._cleanupInterval);
    this.pending.clear();
  }
}

module.exports = { PairingManager };
