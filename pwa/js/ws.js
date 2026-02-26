/**
 * WebSocket client for Hotbutter Voice relay.
 * Includes exponential backoff reconnection and connection state tracking.
 */
class RelayClient {
  static RECONNECT_DELAYS = [2000, 4000, 8000, 16000];
  static MAX_RECONNECT_ATTEMPTS = 10;

  constructor() {
    this.ws = null;
    this.sessionId = null;
    this.agentName = null;
    this.handlers = {};
    this._relayUrl = null;
    this._reconnectAttempt = 0;
    this._shouldReconnect = false;
    this._reconnectTimer = null;
    this._state = 'disconnected'; // disconnected | connecting | connected | paired
  }

  get state() { return this._state; }

  on(event, fn) {
    this.handlers[event] = fn;
  }

  _emit(event, data) {
    if (this.handlers[event]) this.handlers[event](data);
  }

  _setState(state) {
    this._state = state;
    this._emit('state', state);
  }

  connect(relayUrl) {
    if (relayUrl) this._relayUrl = relayUrl;
    this._shouldReconnect = true;
    this._openSocket();
  }

  _openSocket() {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      try { this.ws.close(); } catch {}
      this.ws = null;
    }

    this._setState('connecting');

    const wsUrl = this._relayUrl.replace(/^http/, 'ws') + '/ws/client';
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this._reconnectAttempt = 0;
      this._setState('connected');
      this._emit('connected');
    };

    this.ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }

      switch (msg.type) {
        case 'relay:paired':
          this.sessionId = msg.sessionId;
          this.agentName = msg.agentName;
          this._setState('paired');
          this._emit('paired', { sessionId: msg.sessionId, agentName: msg.agentName });
          break;
        case 'relay:message':
          this._emit('message', { text: msg.text, timestamp: msg.timestamp });
          break;
        case 'relay:typing':
          this._emit('typing', { active: msg.active });
          break;
        case 'relay:agent-disconnected':
          this._emit('agent-disconnected');
          break;
        case 'relay:error':
          this._emit('error', { error: msg.error });
          break;
      }
    };

    this.ws.onclose = () => {
      const wasPaired = this._state === 'paired';
      this._setState('disconnected');
      this._emit('disconnected', { wasPaired });
      this._tryReconnect();
    };

    this.ws.onerror = () => {
      this._emit('error', { error: 'Connection failed' });
    };
  }

  pair(code) {
    this._send({ type: 'client:pair', code });
  }

  sendMessage(text) {
    this._send({ type: 'client:message', text });
  }

  disconnect() {
    this._shouldReconnect = false;
    clearTimeout(this._reconnectTimer);
    this._send({ type: 'client:disconnect' });
    if (this.ws) this.ws.close();
    this.ws = null;
    this.sessionId = null;
    this.agentName = null;
    this._reconnectAttempt = 0;
    this._setState('disconnected');
  }

  _send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  _tryReconnect() {
    if (!this._shouldReconnect) return;
    if (this._reconnectAttempt >= RelayClient.MAX_RECONNECT_ATTEMPTS) {
      this._emit('reconnect-failed');
      return;
    }
    const delays = RelayClient.RECONNECT_DELAYS;
    const delay = delays[Math.min(this._reconnectAttempt, delays.length - 1)];
    this._reconnectAttempt++;
    this._emit('reconnecting', { attempt: this._reconnectAttempt, delay });
    this._reconnectTimer = setTimeout(() => this._openSocket(), delay);
  }
}
