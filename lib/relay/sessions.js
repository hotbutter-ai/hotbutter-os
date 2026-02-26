const crypto = require('crypto');

class SessionManager {
  constructor() {
    // sessionId → { agentWs, clientWs, agentId, agentName, createdAt }
    this.sessions = new Map();
  }

  create(agentWs, clientWs, agentId, agentName) {
    const sessionId = crypto.randomUUID();
    const session = {
      agentWs,
      clientWs,
      agentId,
      agentName,
      createdAt: Date.now(),
    };
    this.sessions.set(sessionId, session);
    return sessionId;
  }

  get(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  remove(sessionId) {
    this.sessions.delete(sessionId);
  }

  findByAgent(agentWs) {
    for (const [sessionId, session] of this.sessions) {
      if (session.agentWs === agentWs) return { sessionId, session };
    }
    return null;
  }

  findByClient(clientWs) {
    for (const [sessionId, session] of this.sessions) {
      if (session.clientWs === clientWs) return { sessionId, session };
    }
    return null;
  }

  removeByAgent(agentWs) {
    for (const [sessionId, session] of this.sessions) {
      if (session.agentWs === agentWs) {
        this.sessions.delete(sessionId);
        return { sessionId, session };
      }
    }
    return null;
  }

  removeByClient(clientWs) {
    for (const [sessionId, session] of this.sessions) {
      if (session.clientWs === clientWs) {
        this.sessions.delete(sessionId);
        return { sessionId, session };
      }
    }
    return null;
  }

  get activeCount() {
    return this.sessions.size;
  }
}

module.exports = { SessionManager };
